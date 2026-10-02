using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Impostor.Api.Games;
using Microsoft.Extensions.Logging;

namespace GameNight.Relay;

/// <summary>
/// Turns game events into JSON envelopes and posts them to the receiver from a background task.
/// Impostor calls listeners from inside its packet handlers, so nothing here may block: Emit only
/// enqueues, and a full queue drops the oldest event rather than stalling the game.
/// </summary>
public sealed class EventSink : IAsyncDisposable
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly Channel<string> _queue = Channel.CreateBounded<string>(
        new BoundedChannelOptions(1024) { FullMode = BoundedChannelFullMode.DropOldest });

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private readonly CancellationTokenSource _cts = new();
    private readonly string _url;
    private readonly ILogger _logger;
    private readonly Task _drain;
    private long _seq;

    public EventSink(string url, ILogger logger)
    {
        _url = url;
        _logger = logger;
        _drain = Task.Run(DrainAsync);
    }

    public void Emit(string type, IGame game, object? data = null)
    {
        var envelope = new
        {
            Ts = DateTimeOffset.UtcNow,
            Seq = Interlocked.Increment(ref _seq),
            Game = game.Code.Code,
            Type = type,
            Data = data,
        };

        _queue.Writer.TryWrite(JsonSerializer.Serialize(envelope, Json));
    }

    private async Task DrainAsync()
    {
        await foreach (var json in _queue.Reader.ReadAllAsync(_cts.Token))
        {
            try
            {
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                using var response = await _http.PostAsync(_url, content, _cts.Token);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Receiver returned {Status} from {Url}", (int)response.StatusCode, _url);
                }
            }
            catch (OperationCanceledException) when (_cts.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Failed to post event to {Url}: {Message}", _url, ex.Message);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _queue.Writer.TryComplete();
        _cts.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            await _drain;
        }
        catch (OperationCanceledException)
        {
        }

        _cts.Dispose();
        _http.Dispose();
    }
}

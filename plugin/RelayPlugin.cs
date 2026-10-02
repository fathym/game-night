using Impostor.Api.Events.Managers;
using Impostor.Api.Plugins;
using Microsoft.Extensions.Logging;

namespace GameNight.Relay;

/// <summary>
/// Entry point Impostor discovers in plugins/. Wires one event listener to one sink;
/// everything interesting happens in the workbench (fAI / OpenX), not on this server.
/// </summary>
[ImpostorPlugin("dev.ttrichar.gamenight")]
public class RelayPlugin : PluginBase
{
    private const string DefaultUrl = "http://receiver:8420/events";

    private readonly ILogger<RelayPlugin> _logger;
    private readonly IEventManager _eventManager;
    private EventSink? _sink;
    private IDisposable? _unregister;

    public RelayPlugin(ILogger<RelayPlugin> logger, IEventManager eventManager)
    {
        _logger = logger;
        _eventManager = eventManager;
    }

    public override ValueTask EnableAsync()
    {
        var url = Environment.GetEnvironmentVariable("GAMENIGHT_URL") ?? DefaultUrl;
        _sink = new EventSink(url, _logger);
        _unregister = _eventManager.RegisterListener(new GameEventListener(_sink));
        _logger.LogInformation("GameNight Relay enabled, posting to {Url}", url);
        return default;
    }

    public override async ValueTask DisableAsync()
    {
        _unregister?.Dispose();
        if (_sink is not null)
        {
            await _sink.DisposeAsync();
        }

        _logger.LogInformation("GameNight Relay disabled");
    }
}

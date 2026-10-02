using Impostor.Api.Events;
using Impostor.Api.Events.Meeting;
using Impostor.Api.Events.Player;
using Impostor.Api.Net;
using Impostor.Api.Net.Inner.Objects;

namespace GameNight.Relay;

/// <summary>
/// One method per game event the leaderboard scores against. Each describes the players involved
/// and hands the event to the sink; no game logic lives here.
/// </summary>
public sealed class GameEventListener : IEventListener
{
    private readonly EventSink _sink;

    public GameEventListener(EventSink sink)
    {
        _sink = sink;
    }

    [EventListener]
    public void OnGameCreated(IGameCreatedEvent e) =>
        _sink.Emit("game.created", e.Game, new { Host = e.Host?.Name });

    [EventListener]
    public void OnPlayerJoined(IGamePlayerJoinedEvent e) =>
        _sink.Emit("lobby.joined", e.Game, new { Player = Describe(e.Player) });

    [EventListener]
    public void OnPlayerLeft(IGamePlayerLeftEvent e) =>
        _sink.Emit("lobby.left", e.Game, new { Player = Describe(e.Player), e.IsBan });

    // Roles are known here at t = 0 and again at game.ended; nowhere else. Stored downstream, never on a live board before game end.
    [EventListener]
    public void OnGameStarted(IGameStartedEvent e) =>
        _sink.Emit("game.started", e.Game, new { Roster = e.Game.Players.Select(DescribeWithRole).ToArray() });

    // Body == null means the emergency button; otherwise a body was reported.
    [EventListener]
    public void OnMeetingCalled(IPlayerStartMeetingEvent e) =>
        _sink.Emit("meeting.called", e.Game, new
        {
            By = Describe(e.PlayerControl),
            Body = Describe(e.Body),
            Trigger = e.Body is null ? "button" : "body",
        });

    [EventListener]
    public void OnVoted(IPlayerVotedEvent e) =>
        _sink.Emit("meeting.vote", e.Game, new
        {
            Voter = Describe(e.PlayerControl),
            For = Describe(e.VotedFor),
            Kind = e.VoteType.ToString(),
        });

    [EventListener]
    public void OnMeetingEnded(IMeetingEndedEvent e) =>
        _sink.Emit("meeting.ended", e.Game, new { Exiled = Describe(e.Exiled), e.IsTie });

    [EventListener]
    public void OnExiled(IPlayerExileEvent e) =>
        _sink.Emit("player.exiled", e.Game, new { Player = Describe(e.PlayerControl) });

    [EventListener]
    public void OnMurder(IPlayerMurderEvent e) =>
        _sink.Emit("player.murdered", e.Game, new { Killer = Describe(e.PlayerControl), Victim = Describe(e.Victim) });

    [EventListener]
    public void OnChat(IPlayerChatEvent e) =>
        _sink.Emit("chat", e.Game, new { From = Describe(e.PlayerControl), e.Message });

    [EventListener]
    public void OnGameEnded(IGameEndedEvent e) =>
        _sink.Emit("game.ended", e.Game, new
        {
            Reason = e.GameOverReason.ToString(),
            Roster = e.Game.Players.Select(DescribeWithRole).ToArray(),
        });

    // The join event fires before the host spawns the character, so lobby.joined always falls back to the connection identity.
    private static object Describe(IClientPlayer p) =>
        p.Character is { } c ? Describe(c)! : new { Client = p.Client.Id, Name = p.Client.Name };

    private static object? Describe(IInnerPlayerControl? c) =>
        c is null ? null : new
        {
            Id = c.PlayerId,
            Name = c.PlayerInfo?.PlayerName,
            Color = c.PlayerInfo?.CurrentOutfit.Color.ToString(),
        };

    private static object DescribeWithRole(IClientPlayer p) =>
        p.Character is { } c ? DescribeWithRole(c) : Describe(p);

    private static object DescribeWithRole(IInnerPlayerControl c) => new
    {
        Id = c.PlayerId,
        Name = c.PlayerInfo?.PlayerName,
        Color = c.PlayerInfo?.CurrentOutfit.Color.ToString(),
        Impostor = c.PlayerInfo?.IsImpostor,
        Role = c.PlayerInfo?.RoleType?.ToString(),
    };
}

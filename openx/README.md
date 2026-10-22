# OpenX: the game-night workspace

Game night's telemetry lives in its own [OpenX](https://openx.fathym.com) workspace:
- the bands, the EmotiBit bridge, the Impostor plugin and the voice bot send to IoT Hub
- OpenX stores everything in Azure Data Explorer (ADX)
- voice audio goes to the workspace's file storage
- the workbench runs beside it

This is the one-time setup, for the host. The architecture is in the [root README](../README.md).

The senders' OpenX code is still being built (see [Status](../README.md#status)). Until it lands, set
up the workspace and Data Connections, and test them with OpenX's HTTP test panel (Step 5).

UI labels and behaviour below were checked against OpenX's source on 2026-10-22. Where OpenX's own docs
disagree, this follows the code.

## Before you start

- **An OpenX plan with private infrastructure** (Pro or Sovereign), plus the right to deploy. Without
  it, Cloud Connections shows "Upgrade needed".
- **An Azure subscription you own.**
  - OpenX creates an app registration and gives it Owner on the subscription, so connecting needs an
    Azure sign-in that can register apps (Graph Application.ReadWrite.All).
  - It also needs Owner or User Access Administrator on the subscription. A directory admin can
    approve once if you can't.
- **Costs.**
  - IoT Hub S1, about $25 a month.
  - An ADX Dev cluster, billed while it runs: stop it between game nights (see
    [Between game nights](#between-game-nights)).
  - A small storage account, Key Vault and Log Analytics.

**Order matters:** cloud, then landing zone, then IoT, then Data Connections. A Data Connection
created before the private IoT exists lands on Fathym's shared hub. When it moves to your hub, it
becomes a new device with new keys, and every band would need re-provisioning.

## Step 1: Create the workspace

1. **Workspace → View All... → + Create New Workspace.** Name it `game-night` and click **Create**.
   OpenX switches you into it.
2. **Keep the team to the hosts.** OpenX doesn't partition raw telemetry within a workspace, and its
   warm-query routes check no rights. So anyone on the team can read every player's biometrics.
   Invite only people who may (Workspace → **Team Members**).

   The Role picker in the invite form isn't applied: every invited member is added as a non-owner,
   whatever it says. After inviting, reopen the dialog to confirm the person is listed: the
   "Invitation sent" toast shows even when the server refuses.

## Step 2: Connect your Azure subscription

1. **Environment → Cloud Connections → Bring Your Own Cloud → Sign in with Microsoft.**
2. Choose the directory, then **Select Subscription**, pick yours and click **Connect Subscription**.
3. If it asks, use **Approve access in Azure**, then Connect again.

OpenX creates an app registration named `eac|<workspace>|Workspace` with Owner on the subscription.
A workspace holds one cloud.

## Step 3: Provision the landing zone

**Environment → Manage Private CALZ.**
- Pick a **Region** near you and your players. It's permanent.
- Click **Provision Landing Zone**.

This creates a resource group (`oi-calz-…`) with a storage account, Key Vault and Log Analytics. The
storage account is where voice audio will live.

## Step 4: Provision IoT

**Environment → Manage IoT** (it appears once the landing zone exists):

| Field | Set to | Why |
|---|---|---|
| Data arrival | **Live** | Queryable in about 20 s. Bulk batches every 5 minutes. |
| Keep telemetry for | 90 days, or 30 | ADX's retention. Pick what the group agreed for biometrics. |
| Cluster tier | Dev (no SLA) | One node, lowest cost |
| Hub tier / units | S1 / 1 | One S1 unit takes 400,000 messages a day; a 4-hour night with 8 bands is about 115,000. Device twins need S1, not Basic. |
| Cold path | Off | It bills and can't be turned off later |

Click **Save & Provision IoT**. The ADX cluster takes 10–20 minutes. Device provisioning (DPS) and
Edge modules show as disabled: OpenX hasn't built them yet.

This creates, in a `…-iot` resource group:
- the hub `oi-<hash>-iot-hub`
- an ADX cluster with the database `telemetry-<hash>` and the table
  `Devices(DeviceID, EnqueuedTime, MessageID, RawData)`
- the hub-to-ADX connection

**Gate:** the dialog shows the cluster running. If the first save stalls, save once more. OpenX's QA
saw this, and a quota refusal shows as "Creating" for 30 minutes instead of failing.

## Step 5: Create the Data Connections

One Connection per sender. Each is one IoT Hub device:

| Connection ID | Sender | Its credential goes to |
|---|---|---|
| `impostor` | Impostor plugin | `GAMENIGHT_IOT_CONNECTION` in the Impostor host's settings |
| `voice` | Voice bot (events) | `GAMENIGHT_IOT_CONNECTION` in the voice bot's settings |
| `emotibit-1` | EmotiBit bridge on the wearer's PC | The bridge's `GAMENIGHT_IOT_CONNECTION` |
| `band-B01` … `band-B08` | Each band | Loaded into the band over USB ([band/FIRMWARE.md](../band/FIRMWARE.md#provisioning)) |

1. On the canvas, drag **Connection** from the node bank (top left) for each row, and set its
   **Connection ID**.
2. Click **Commit Changes** (the save icon, top right), then **Deploy** in the top bar, and confirm in
   the Deploy dialog. Deploy registers the hub devices.
   - Wait until Step 4's cluster is running: a deploy while IoT is still provisioning fails with "no
     IoT Hub name was supplied".
3. **Copy each credential.** Select the Connection → Inspector → **Connection Info**.
   - **Device ConnStr (primary)** is what the plugin, voice bot and bridge take.
   - For a band, the host loads the same string's `HostName`, `DeviceId` and `SharedAccessKey`.
   - Ignore the "Device SAS (… 7d)" tokens. They expire, and senders mint their own.

**Device IDs are hashes:** SHA-256 of the workspace and the connection's internal ID, not the name you
typed. That's why every message names its own sender (`src`, and `band` for bands). Write down each
band's and bridge's **DeviceID** from Connection Info: Step 7 needs them.

**Gate:**
1. **APIs → API Manager → Device Connectivity**, pick `impostor` and **Send POST** a test body such
   as `{"src":"test"}`. The generated code snippets prefix the token with "Bearer "; delete that, as
   IoT Hub expects `Authorization: SharedAccessSignature …`.
2. Then run `Devices | order by EnqueuedTime desc | take 10` as a warm query (Step 6). The test row
   appears within about 20 s.
3. OpenX's Live Stream may stay empty for a private hub. Use the warm query to check arrivals.

## Step 6: Surface and warm queries

1. Drag **Surface** onto the canvas, name it `game-night`, and draw an edge from every Connection to
   it. Click **Commit Changes**.
2. **Manage Surface**, drag **Warm Query**, connect it, and set:
   - **Query Name** `recent`
   - **API Path** `recent`
3. **Manage Query**: enter `Devices | order by EnqueuedTime desc | take 100` and **Run Query**. Then
   Commit Changes.

**Ad-hoc queries over the API:** `POST https://openx.fathym.com/ox-api/warm-queries` with
`Authorization: Bearer <API key>` and the body `{"Query": "Devices | take 10"}`.
- The field is **`Query`, capital Q**. OpenX's docs say `query`, which silently runs a default query
  instead.
- Commands that start with a dot are refused.

## Step 7: Recording control (the hub's service policy)

OpenX can't message devices yet, so the voice bot sets each band's and bridge's device twin directly
on your hub. The hub is in your subscription, so this works outside OpenX.

1. **Azure portal → resource group `…-iot` → the IoT Hub → Shared access policies → `service`.** Copy
   its primary connection string into the voice bot's settings as `GAMENIGHT_IOTHUB_SERVICE`.
2. Put the DeviceIDs of every band and bridge from Step 5 in `GAMENIGHT_TWIN_DEVICES`, comma-separated.

**On `/gamenight start`**, the bot sets each one's desired properties to `recording: true` and a new
`session`. **On `/gamenight stop`**, it sets `recording: false`.

What OpenX owns and what's safe to touch:
- **Desired properties** survive OpenX deploys. OpenX patches only its own tags (`WorkspaceLookup`,
  `DeviceName`, `DataConnectionLookup`), and changes to those three are reverted.
- **`iothubowner`.** Don't delete or regenerate it. OpenX reads that policy's secondary key, and the
  hub-to-ADX connection is bound to it.
- **Consumer groups.** For your own tools, use the `service` policy and a consumer group of your own,
  never the `openindustrial…` groups.
- **Retiring a band** (lost, or leaving the group). Switch its Connection off in OpenX, or delete it.
  A device disabled only in the Azure portal is re-enabled at the next deploy.

## Step 8: API keys and file rights

**APIs → API Keys** mints a JWT:
- **Lifetime.** At most 30 days. Keys can't be revoked: OpenX stores no list of them, despite what its
  docs say. Keep lifetimes short and set a monthly reminder to re-mint.
- **Scopes.** The scope checkboxes start with all your rights ticked. Untick everything a key doesn't
  need.

| Key for | Rights | Goes to |
|---|---|---|
| Voice bot audio uploads | `Workspace.Files.Write` | `GAMENIGHT_OX_TOKEN` in the voice bot's settings |
| The hosted workbench | warm queries (no right is enforced yet) | `FATHYM_OX_SERVICE_JWT` in the workbench's Environment (Step 9) |
| Calling the workbench from Claude Code | `Workspace.Workbench.Host` | Your MCP client's settings |

**Caveat:** the owner card a new workspace starts with carries only data-store rights, not
`Workspace.Files.Write`, so you can't mint a key with it yet.
- As the workspace's sole owner, you can grant yourself a configuration that has it. Use
  **Environment → App Identity → Configurations** (enabled once App Identity is set up), then
  `POST /ox-api/access/members/<you>/cards` with `{"AccessConfigurationLookup": "…"}`.
- If that's unclear in the UI, ask the OpenX team. Voice audio can't be uploaded until it's done.

**File storage:**
- **Upload:** `POST /ox-api/files?name=voice/<session>/<file>.ogg` with the raw bytes and
  `Content-Type: audio/ogg`.
  - Up to 500 MB.
  - Never overwrites: an existing name returns 409.
- **List:** `GET /ox-api/files?prefix=voice/`.
- **Download:** `GET /ox-api/files/content?name=…`.
- There's no file browser in the UI.

## Step 9: Host the workbench

This becomes useful once the workbench reads ADX ([Status](../README.md#status)). Until then, the
hosted copy serves its synthetic demo.

1. Inside the surface, drag **Workbench**. It's in the node bank only if you hold
   `Workspace.Workbench.Host`; ask the OpenX team if it's missing.
2. **Source:**
   - **Repo** `ttrichar/game-night`. Public works.
   - **Ref:** a tag or commit SHA, to pin it. A branch redeploys its latest commit on every deploy.
   - **Entry** `workbench/game-night.ts`.
   - Leave **Dockerfile** empty. The default installs fai 0.0.785, the version the workbench pins.
3. **Modes:** **Add mode → MCP**. Under "Who may call this mode", choose **Anyone signed in to this
   workspace**.
4. **Hosting:** APISlug `game-night`. Min replicas 0 (scales to zero; the first call takes 5–15 s) or
   1.
5. **Environment:**
   - `FATHYM_OX_SERVICE_JWT`: the key from Step 8.
   - `GAMENIGHT_OX_API`: `https://openx.fathym.com/ox-api`.

   These become container secrets.
6. **Commit Changes → Deploy.** The MCP endpoint appears on the Hosting tab and under **APIs → API
   Manager → Workbench MCP**: `https://openx.fathym.com/oi-api/workbenches/game-night/MCP`. Callers
   need a key with `Workspace.Workbench.Host`.

With a landing zone, the workbench deploys into your subscription. That needs a registry token on
Fathym's side; if the deploy refuses, ask the OpenX team.

## Between game nights

- **Stop the cluster.** In **Environment → Manage IoT**, use **Stop Cluster** after a night and **Start
  Cluster** before the next. The hub holds arriving telemetry for 7 days, so a band that sends while
  the cluster is stopped loses nothing within that window.
- **Re-mint keys** before they expire: the voice bot's, the workbench's, and your own.
- **Retention.** "Keep telemetry for" can be lengthened any time. Shortening it asks for confirmation
  and makes older data eligible for removal.

## Privacy and deletion

- **Where the data is.** Raw biometrics, game events and voice metadata live in the workspace's ADX
  database. Audio lives in the landing zone's storage account. Both are in your subscription.
- **Deleting audio.** `DELETE /ox-api/files?name=…&comment=…` is a soft delete, restorable for 90 days.
  It needs **Environment → Provenance** provisioned, for the audit trail. OpenX has no purge. To delete
  audio for good, as agreed once it's transcribed, delete the blobs in the storage account's `files`
  container, including `.oi-trash/`, in the Azure portal.
- **Deleting telemetry.** OpenX has no telemetry delete. Retention expires it. Removing data sooner is
  done in Azure: ADX admin commands on the `telemetry-…` database, or deleting the database or
  cluster.

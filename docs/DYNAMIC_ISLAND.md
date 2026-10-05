# iOS Dynamic Island and Live Activities

An active tuur tour starts a local Live Activity while the app is in the foreground. iOS presents it in the Dynamic Island on supported iPhones and on the Lock Screen. Tapping it opens `tuur://play`, returning to the current player. If the app was terminated and the in-memory tour no longer exists, the player returns home and startup removes the old activity.

The compact view shows the current state and distance or audio/pause indicator. Hold the island to see the stop name, tour progress, and status. The Lock Screen shows the same information. German and English follow the app language. Crossroads prompts the listener to reopen tuur to choose the next stop; Explore reports that it is looking for nearby stories.

Distances are straight-line distances to the guide's current target, labelled accordingly in the expanded view and banner. The routing model does not supply turn instructions, so the activity does not show street turns or road-based arrival times.

## Native build

- `expo-widgets` and `@expo/ui` match Expo SDK 57. The app config enables Live Activities and generates `com.tuurapp.widgets` with the shared app group `group.com.tuurapp`.
- Rebuild and install the iOS app with the existing native/EAS build flow. Expo Go and binaries built before this extension was added skip the integration. An OTA JavaScript update cannot add the native extension.
- Signing must include the widget extension and app-group capability for the app and extension. No APNs key, notification server, or push notification permission is needed; updates come from the existing local guide runtime.
- No extra location permission is requested. Existing tour/background-location permissions continue to apply. iOS controls Live Activity availability, placement, and update scheduling.

## Lifecycle and privacy

The activity belongs to the guide session, so leaving/minimizing the player does not remove it. Finishing, ending, or replacing a tour removes it. A dismissed activity is not recreated for the same session. Disabling Live Activities or a native failure does not stop audio or navigation.

Distance-only updates are coalesced to five seconds; meaningful status changes are sent immediately. Identical content refreshes its native expiry at most every 30 seconds. A 60-second ActivityKit stale date lets the system view hide outdated distance and ask the listener to reopen tuur even if JavaScript is suspended. While JavaScript runs, stale GPS or foreground-only location in the background also removes distance. The activity's payload contains presentation text and progress only, without coordinates, route geometry, transcript, account identifiers, or server calls.

## Device verification

1. Use a freshly built iOS app on a Dynamic Island iPhone, enable Live Activities in system settings, and start a tour. Leave tuur and check compact and expanded island views. Lock the phone and check the banner; tap it to return to the player.
2. Walk toward a stop. Check the distance, narration status, pause/resume, and progress. Try German/English, long stop names, VoiceOver, dark appearance, and Always-On Display.
3. Try Crossroads while waiting for a choice and Explore with no target. Switch a planned walk to Explore and check the activity follows the current mode.
4. Deny background location. Leaving the app must hide live distance and prompt reopening. Suspend runtime updates for over 60 seconds and confirm the stale fallback. Resume and confirm fresh updates recover.
5. End and rapidly replace tours. Only the current tour may remain. Finish the last stop and confirm removal. Dismiss the activity manually; subsequent GPS fixes must not recreate it for that tour.
6. Disable Live Activities and check the normal tour still works. Force-quit and relaunch: old activities must be removed and tapping a stale deep link must return home safely.
7. On an iPhone without Dynamic Island, check the Lock Screen presentation. Expo Go, Android, and web should keep working without the iOS widget runtime.

Native rendering, signing, and real background scheduling require the device checks above; TypeScript, unit tests, and Metro export do not substitute for them.

References: [Expo SDK 57 widgets](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/), [Apple ActivityKit lifecycle](https://developer.apple.com/documentation/activitykit/activity).

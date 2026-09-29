import TrackPlayer, { Event } from 'react-native-track-player';
import { remoteBus } from './types';

/** Runs in the background: forwards lock-screen and headset button presses to the app logic (spec 5). */
export default async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => remoteBus.emit('play'));
  TrackPlayer.addEventListener(Event.RemotePause, () => remoteBus.emit('pause'));
  TrackPlayer.addEventListener(Event.RemoteNext, () => remoteBus.emit('next'));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => remoteBus.emit('previous'));
  TrackPlayer.addEventListener(Event.RemoteJumpForward, () => remoteBus.emit('next'));
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, () => remoteBus.emit('previous'));
}

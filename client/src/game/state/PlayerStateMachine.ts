import type { PlayerState } from '../../types/protocol';

export type ActivityState = Extract<PlayerState, 'working' | 'drinking' | 'resting'>;

const INTERACTING_MS = 180;
const ACTIVITY_MS = 1200;

export class PlayerStateMachine {
  private state: PlayerState = 'idle';
  private movementLockedUntil = 0;
  private activityAt = 0;
  private activityState: ActivityState | null = null;
  private idleAt = 0;

  reset(state: PlayerState, now: number): PlayerState {
    this.clearTimers();
    this.state = state;

    if (state === 'working' || state === 'drinking' || state === 'resting') {
      this.idleAt = now + ACTIVITY_MS;
      this.movementLockedUntil = now + ACTIVITY_MS;
    }

    return this.state;
  }

  beginInteraction(nextActivity: ActivityState, now: number): PlayerState {
    this.state = 'interacting';
    this.movementLockedUntil = now + INTERACTING_MS + ACTIVITY_MS;
    this.activityAt = now + INTERACTING_MS;
    this.activityState = nextActivity;
    this.idleAt = now + INTERACTING_MS + ACTIVITY_MS;
    return this.state;
  }

  setMovement(isMoving: boolean, now: number): PlayerState {
    if (this.isMovementLocked(now)) {
      return this.state;
    }

    this.state = isMoving ? 'walking' : 'idle';
    return this.state;
  }

  syncFromServer(state: PlayerState, now: number): PlayerState {
    return this.reset(state, now);
  }

  tick(now: number): PlayerState {
    if (this.activityState && now >= this.activityAt) {
      this.state = this.activityState;
      this.activityState = null;
      this.activityAt = 0;
    }

    if (this.idleAt && now >= this.idleAt) {
      this.state = 'idle';
      this.idleAt = 0;
      this.movementLockedUntil = 0;
    }

    return this.state;
  }

  isMovementLocked(now: number): boolean {
    return now < this.movementLockedUntil;
  }

  getState(): PlayerState {
    return this.state;
  }

  private clearTimers(): void {
    this.movementLockedUntil = 0;
    this.activityAt = 0;
    this.activityState = null;
    this.idleAt = 0;
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { GardenState } from '../src/domain/state.ts';

test('天时保留在合法范围，并且只对实际变化发出事件', () => {
  const state = new GardenState(['xiaoxiang']);
  let count = 0;
  state.addEventListener('timechange', () => count++);
  state.setTime(18.5);
  state.setTime(18.5);
  assert.equal(state.snapshot().hour, 18.5);
  assert.equal(count, 1);
  state.setTime(24);
  assert.equal(state.snapshot().hour, 0);
  assert.throws(() => state.setTime(Number.NaN), RangeError);
  assert.throws(() => state.setTime(27), RangeError);
});

test('不接受不存在的院落与不合法天气，状态保持一致', () => {
  const state = new GardenState(['xiaoxiang']);
  assert.throws(() => state.focus('missing'), RangeError);
  assert.throws(() => state.setWeather('storm' as never), RangeError);
  assert.equal(state.snapshot().weather, 'clear');
  state.focus('xiaoxiang');
  state.setWeather('rain');
  assert.equal(state.snapshot().activeLandmark, 'xiaoxiang');
  assert.equal(state.snapshot().weather, 'rain');
});

test('景物状态与外部快照隔离，能给未来叙事单独控制一个院落', () => {
  const state = new GardenState(['xiaoxiang', 'yihong']);
  state.setLandmarkState('xiaoxiang', { bloom: 0.3, activity: 0.2 });
  const copy = state.snapshot();
  copy.landmarks.xiaoxiang!.bloom = 0.9;
  assert.equal(state.snapshot().landmarks.xiaoxiang!.bloom, 0.3);
  assert.equal(state.snapshot().landmarks.yihong, undefined);
  assert.throws(() => state.setLandmarkState('yihong', { bloom: -0.1 }), RangeError);
});

#!/usr/bin/env python3
"""Reusable AC/battery governor for long-running local training jobs.

The caller owns checkpoints and process control.  This module is deliberately
CPU-only: it turns an injected resource sample plus a JSON policy into a stable
action, so a project can test its power policy without importing its ML stack.
"""
import argparse
import json
import math
from pathlib import Path

SCHEMA = 'ggd-training-power-governor@1'
MODES = {'full-speed', 'paused', 'throttled'}


def read(path):
    return json.loads(Path(path).read_text())


def validate(policy):
    if policy['schema'] != SCHEMA: raise ValueError('INVALID_POLICY_SCHEMA')
    for key in ('hardStopPercent', 'pauseBelowPercent', 'fullSpeedResumePercent', 'sampleIntervalSeconds'):
        if type(policy[key]) not in (int, float) or not math.isfinite(policy[key]):
            raise ValueError('INVALID_POLICY_NUMBER:' + key)
    hard, pause, resume = policy['hardStopPercent'], policy['pauseBelowPercent'], policy['fullSpeedResumePercent']
    if not 0 <= hard < pause < resume <= 100: raise ValueError('INVALID_POLICY_THRESHOLDS')
    if policy['sampleIntervalSeconds'] < 1: raise ValueError('INVALID_SAMPLE_INTERVAL')
    if policy['lowPowerMode'] not in {'pause', 'throttle'}: raise ValueError('INVALID_LOW_POWER_MODE')
    declines = policy.get('throttleDecliningSamples', 2)
    if type(declines) is not int or declines < 1: raise ValueError('INVALID_DECLINING_SAMPLES')
    delay = policy.get('throttleSeconds', 0)
    if type(delay) not in (int, float) or not math.isfinite(delay) or delay < 0:
        raise ValueError('INVALID_THROTTLE_DELAY')
    if policy['lowPowerMode'] == 'throttle' and delay <= 0:
        raise ValueError('THROTTLE_REQUIRES_POSITIVE_DELAY')
    return policy


def decide(policy, sample, mode='full-speed'):
    """Return a pure, hysteretic state transition.

    `checkpoint-pause` means finish the current atomic step, persist a complete
    runtime checkpoint, release the GPU worker, then poll at the policy interval.
    `hard-stop` is terminal and must never be converted into an auto-retry.
    """
    validate(policy)
    if mode not in MODES: raise ValueError('INVALID_POWER_MODE')
    battery, ac = sample.get('batteryPercent'), sample.get('acPower')
    if ac is not True:
        return {'action': 'hard-stop', 'nextMode': 'paused', 'reason': 'AC_POWER_REQUIRED'}
    if type(battery) not in (int, float) or not math.isfinite(battery) or not 0 <= battery <= 100:
        return {'action': 'hard-stop', 'nextMode': 'paused', 'reason': 'BATTERY_STATUS_UNKNOWN'}
    if battery < policy['hardStopPercent']:
        return {'action': 'hard-stop', 'nextMode': 'paused', 'reason': 'BATTERY_BELOW_HARD_FLOOR'}
    if battery >= policy['fullSpeedResumePercent']:
        return {'action': 'run-full', 'nextMode': 'full-speed', 'reason': 'BATTERY_AT_FULL_SPEED_THRESHOLD'}
    if mode == 'paused':
        return {'action': 'wait', 'nextMode': 'paused', 'reason': 'WAITING_FOR_FULL_SPEED_THRESHOLD'}
    if battery < policy['pauseBelowPercent']:
        if policy['lowPowerMode'] == 'throttle':
            return {'action': 'run-throttled', 'nextMode': 'throttled', 'reason': 'LOW_BATTERY_THROTTLE',
                    'sleepSeconds': policy.get('throttleSeconds', 0)}
        return {'action': 'checkpoint-pause', 'nextMode': 'paused', 'reason': 'LOW_BATTERY_PAUSE'}
    if mode == 'throttled':
        return {'action': 'run-throttled', 'nextMode': 'throttled', 'reason': 'HYSTERESIS_THROTTLE',
                'sleepSeconds': policy.get('throttleSeconds', 0)}
    return {'action': 'run-full', 'nextMode': 'full-speed', 'reason': 'NORMAL_BATTERY_BAND'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--policy', type=Path, required=True)
    parser.add_argument('--sample', type=Path, required=True, help='JSON containing acPower and batteryPercent')
    parser.add_argument('--mode', choices=sorted(MODES), default='full-speed')
    args = parser.parse_args()
    print(json.dumps(decide(read(args.policy), read(args.sample), args.mode), ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()

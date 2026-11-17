import test from 'node:test';
import assert from 'node:assert/strict';
import { antigravityArgs, claudeCodeArgs } from '../src/adapters.js';

test('Claude Code runner is headless, noninteractive, and limited to explicit file tools',()=>{
 const args=claudeCodeArgs();assert.ok(args.includes('-p'));assert.ok(args.includes('stream-json'));
 assert.deepEqual(args.slice(args.indexOf('--permission-mode'),args.indexOf('--permission-mode')+2),['--permission-mode','dontAsk']);
 assert.deepEqual(args.slice(args.indexOf('--permission-prompts'),args.indexOf('--permission-prompts')+2),['--permission-prompts','none']);
 const allowed=args.slice(args.indexOf('--allowedTools')+1);assert.deepEqual(allowed,['Read','Edit','Write','Glob','Grep']);assert.ok(!allowed.includes('Bash'));
});

test('Antigravity runner enables semantic headless output with workspace editing and terminal sandbox',()=>{
 const args=antigravityArgs('inspect and update the project');assert.deepEqual(args.slice(0,2),['-p','inspect and update the project']);
 assert.ok(args.includes('stream-json'));assert.ok(args.includes('--mode=accept-edits'));assert.ok(args.includes('--sandbox'));
 assert.ok(args.includes('--print-timeout'));assert.ok(args.includes('15m'));assert.ok(!args.includes('--dangerously-skip-permissions'));
});

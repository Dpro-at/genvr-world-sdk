import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { LabProjectData } from '@genvr/contracts';
import { createLabProject, importStudioProject, readStudioProject } from '../src/studio-project.js';

describe('motion lab project (MOTION-LAB, Q-LAB-1)', () => {
  it('is its own project with an empty world and the lab part, and survives export and import', () => {
    const lab = LabProjectData.parse({ course: { obstacles: [{ id: 'step-1', kind: 'step', z: 3 }] } });
    const project = createLabProject(lab);
    expect(project.title).toBe('Motion lab');
    expect(project.world.instances).toHaveLength(0);
    expect(project.lab?.course.obstacles[0]).toMatchObject({ kind: 'step', height: 0.3 });
    expect(importStudioProject(JSON.stringify(project)).lab).toEqual(project.lab);
    expect(() => readStudioProject({ ...project, lab: { course: { obstacles: [{ id: 'x', kind: 'beam', z: 1 }] } } })).toThrow();
  });
});

it('lists motion_lab and its guide over MCP, and needs a live Studio to run', async () => {
  const folder = await mkdtemp(resolve(tmpdir(), 'genvr-lab-mcp-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/mcp.js', import.meta.url))], env: { GENVR_WORLD_DIR: folder } });
  const client = new Client({ name: 'sdk-lab-test', version: '1' });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    expect(tools.some((tool) => tool.name === 'motion_lab')).toBe(true);
    const guide = await client.callTool({ name: 'get_motion_lab_guide', arguments: {} });
    expect((guide.content as Array<{ text: string }>)[0]!.text).toContain('foot_slide_cm');
    const caps = JSON.parse(((await client.callTool({ name: 'get_studio_capabilities', arguments: {} })).content as Array<{ text: string }>)[0]!.text);
    expect(caps.motionLab).toMatchObject({ tool: 'motion_lab', executable: false });
    const run = await client.callTool({ name: 'motion_lab', arguments: { operation: { kind: 'run' } } });
    expect(run.isError).toBe(true);
    expect((run.content as Array<{ text: string }>)[0]!.text).toMatch(/live Studio/);
  } finally { await client.close(); }
}, 30000);

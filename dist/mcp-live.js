import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { callLiveStudio } from './live-studio.js';
import { FILMING_ARGS } from './mcp-filming.js';
import { z } from 'zod';
const Select = z.object({ session_id: z.string().uuid() }).strict();
export const LIVE_TOOLS = [
    { name: 'list_studio_sessions', description: 'List real connected local Studio sessions before choosing a live viewport.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'select_studio_session', description: 'Select an actual connected local Studio session. Required if multiple windows are connected.', inputSchema: { type: 'object', properties: { session_id: { type: 'string', format: 'uuid' } }, required: ['session_id'], additionalProperties: false } },
    { name: 'inspect_studio', description: 'Inspect the selected live viewport: world style/kind, character, active animation/expression, workspace, actor position and camera. include_checks also returns real placement checks.', inputSchema: { type: 'object', properties: { include_checks: { type: 'boolean' } }, additionalProperties: false } },
];
export class LiveStudioClient {
    connection;
    output;
    selected;
    #jobs = new Map();
    constructor(connection, output) {
        this.connection = connection;
        this.output = output;
    }
    async sessions() { return await callLiveStudio(this.connection, 'sessions'); }
    async select(input) { const { session_id } = Select.parse(input); if (!(await this.sessions()).some(row => row.id === session_id))
        throw new Error('Studio session is not connected.'); this.selected = session_id; return { session_id }; }
    async call(tool, args = {}, sessionId = this.selected) { return callLiveStudio(this.connection, 'call', { tool, arguments: args, ...(sessionId ? { sessionId } : {}) }); }
    async filming(name, input) {
        const args = FILMING_ARGS[name].parse(input);
        if (name === 'get_capture') {
            const job = this.#jobs.get(args.job_id);
            if (!job)
                throw new Error('Unknown local filming job.');
            return job;
        }
        const sessions = (await this.sessions()).filter(session => session.placeId === args.place_id);
        if (name === 'list_capture_sessions')
            return { sessions: sessions.map(row => ({ session_id: row.id, place_id: row.placeId, project_id: row.projectId, title: row.title, local: true })) };
        const sessionId = args.session_id;
        if (!sessions.some(row => row.id === sessionId))
            throw new Error('Filming session does not match the selected local place.');
        if ([...this.#jobs.values()].filter(job => job.status === 'running').length >= 16)
            throw new Error('Too many running filming jobs.');
        while (this.#jobs.size >= 100) {
            const expired = [...this.#jobs].find(([, job]) => job.status !== 'running');
            if (!expired)
                throw new Error('Filming jobs are full.');
            this.#jobs.delete(expired[0]);
        }
        const id = crypto.randomUUID();
        this.#jobs.set(id, { status: 'running' });
        const tool = name === 'record_video' ? 'studio_action' : name;
        const payload = name === 'record_video' ? { operation: { kind: 'record', settings: args.settings } } : args;
        void this.call(tool, payload, sessionId).then(async (result) => {
            if (result && typeof result === 'object' && 'data' in result && 'mime' in result) {
                const artifact = z.object({ mime: z.enum(['image/png', 'video/webm']), data: z.string().max(12 * 1024 * 1024) }).parse(result);
                const folder = resolve(this.output, 'live-captures');
                await mkdir(folder, { recursive: true, mode: 0o700 });
                const path = resolve(folder, id + (artifact.mime === 'image/png' ? '.png' : '.webm'));
                await writeFile(path, Buffer.from(artifact.data, 'base64'), { flag: 'wx', mode: 0o600 });
                result = { path, mime: artifact.mime };
            }
            this.#jobs.set(id, { status: 'done', result });
        }).catch(error => { this.#jobs.set(id, { status: 'failed', error: error instanceof Error ? error.message : 'Filming failed.' }); });
        return { job_id: id, local: true };
    }
}
//# sourceMappingURL=mcp-live.js.map
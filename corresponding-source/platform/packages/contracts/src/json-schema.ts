import { z } from 'zod';
import { AccessPolicy } from './access.js';
import { Command, CommandPayload } from './commands.js';
import { GenvrManifest } from './manifest.js';
import { WorldDocument } from './world.js';

/** JSON Schemas for tools outside TypeScript (AI tool definitions, OpenAPI, MCP, docs). */
export function contractJsonSchemas() {
  return {
    WorldDocument: z.toJSONSchema(WorldDocument, { io: 'input' }),
    Command: z.toJSONSchema(Command, { io: 'input' }),
    CommandPayload: z.toJSONSchema(CommandPayload, { io: 'input' }),
    GenvrManifest: z.toJSONSchema(GenvrManifest, { io: 'input' }),
    AccessPolicy: z.toJSONSchema(AccessPolicy, { io: 'input' }),
  };
}

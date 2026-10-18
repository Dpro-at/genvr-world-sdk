import { rm, readdir } from 'node:fs/promises';
// Clear generated output while retaining previous local release archives.
const root=new URL('./dist/',import.meta.url);
for(const name of await readdir(root).catch(()=>[]))if(!name.endsWith('.tgz'))await rm(new URL(name,root),{recursive:true,force:true});

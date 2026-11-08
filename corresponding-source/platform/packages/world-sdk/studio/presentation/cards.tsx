import type {PresentationSpec} from '@genvr/assistant';
import {AvatarSpecView,type DisplayHost} from './shared-display/renderer';
/** Generated shared source supplies the display registry; callbacks come only from a trusted host. */
export function SpecRenderer({spec,host}:{spec:PresentationSpec;host?:DisplayHost}) { return <AvatarSpecView document={spec} host={host}/>; }

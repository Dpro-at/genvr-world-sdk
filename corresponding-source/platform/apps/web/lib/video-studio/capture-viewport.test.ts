import {expect,it} from 'vitest';
import {captureSize} from './capture-viewport';
it('preserves output ratio inside wide and tall editor viewports',()=>{
 for(const [w,h]of[[1200,400],[400,800],[534,560]]){const size=captureSize(w!,h!,16/9);expect(size.width/size.height).toBeCloseTo(16/9);expect(size.width).toBeLessThanOrEqual(w!);expect(size.height).toBeLessThanOrEqual(h!);}
});

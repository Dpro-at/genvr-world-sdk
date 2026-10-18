/** Keep the live recording surface at the chosen output ratio even when Studio panels resize. */
export function captureSize(width: number, height: number, ratio: number) {
 const w=Math.max(1,Math.min(width,height*ratio));
 return {width:w,height:w/ratio};
}
export function fitCaptureViewport(container: HTMLElement | null, width: number, height: number) {
 const parent=container?.parentElement;
 if(!container||!parent)return()=>{};
 const previous=container.style.cssText;
 const fit=()=>{const rect=parent.getBoundingClientRect(),size=captureSize(rect.width,rect.height,width/height);Object.assign(container.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%, -50%)',width:`${size.width}px`,height:`${size.height}px`});};
 const observer=new ResizeObserver(fit);observer.observe(parent);fit();
 return()=>{observer.disconnect();container.style.cssText=previous;};
}

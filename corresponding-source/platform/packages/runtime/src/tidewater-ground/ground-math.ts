/** Tidewater4811ba48 MIT: retained source terrain equations, provider-bound resource names. */
export const GROUND_WGSL = `fn twGround_groundSurface(position:vec3f,normalRock:vec4f,splat:vec4f,cameraPosition:vec3f,wetFoam:vec2f,windDirection:vec2f,windSpeed:f32,gustOffset:vec2f,swellDirection:vec2f,reefWeight:f32,wetDarken:f32,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler)->mat3x3f{

	let p = position;
	let xz = p.xz;
	let h = p.y;
	var outRough = 0.9;
	var outN = vec3f( 0.0, 1.0, 0.0 );
	var outAO = 1.0;
	var albedoOut = vec3f( 0.0 );

	// ---- data maps
	let nr = normalRock;
	let N0 = normalize( vec3f( nr.x, sqrt( max( 1.0 - nr.x * nr.x - nr.y * nr.y, 0.0025 ) ), nr.y ) );
	let sp = splat;
	let slope = 1.0 - N0.y;
	let camDist = length( cameraPosition - p );
	let dpx = dpdx( p ); let dpy = dpdy( p );
	let fwY = fwidth( h );

	// ---- deep seabed (seen through the water: no rock, land cover, swash or wind ripples),
	// the same colour / relief / AO as the full path below, from 6 detail samples instead of ~17
	// detail samples shared by both paths (sampled in uniform control flow: no derivative seams
	// where the paths meet)
	let macroA = twGround_terDetail( (mat2x2f(0.7648421872844885,0.644217687237691,-0.644217687237691,0.7648421872844885)*(xz)) / 173.0 ,terrainDetailTex,smpAniso4Repeat).w;
	let macroB = twGround_terDetail( (mat2x2f(-0.5048461045998576,0.8632093666488737,-0.8632093666488737,-0.5048461045998576)*(xz)) / 47.0 ,terrainDetailTex,smpAniso4Repeat).w;
	let mcr = macroA * 0.6 + macroB * 0.4;
	let dN = twGround_terDetail( xz / 1.9 ,terrainDetailTex,smpAniso4Repeat);
	let dM = twGround_terDetail( (mat2x2f(0.26749882862458735,0.963558185417193,-0.963558185417193,0.26749882862458735)*(xz)) / 6.7 + 0.21 ,terrainDetailTex,smpAniso4Repeat);
	let dF = twGround_terDetail( (mat2x2f(-0.7373937155412454,0.675463180551151,-0.675463180551151,-0.7373937155412454)*(xz)) / 0.63 + 0.53 ,terrainDetailTex,smpAniso4Repeat);
	let grain = min( dN.z, 0.62 );
	let grainF = min( dF.z, 0.62 );
	let seabedPath = h < -0.8 && nr.z < 0.05 && slope < 0.18;

	let sw = swellDirection;
	let swDir = sw;
	// ripple phases of both paths (identical there), differentiated in uniform control flow
	let ph2 = dot( xz, swDir ) * ( 6.2832 / 0.75 ) + dM.w * 16.0 + macroB * 24.0;
	let fade2 = 1.0 - smoothstep( 0.5, 2.0, fwidth( ph2 ) );
	let rip2 = pow( sin( ph2 ) * 0.5 + 0.5, 1.4 );
	let ph3 = dot( xz, swDir ) * ( 6.2832 / 0.16 ) + dM.w * 26.0 + dN.w * 5.0;
	let fade3 = 1.0 - smoothstep( 0.6, 2.2, fwidth( ph3 ) );
	let rip3 = pow( sin( ph3 ) * 0.5 + 0.5, 1.5 );
	// bump height of either path: the surface-gradient bump runs after the branch (its screen-space
	// derivatives would be undefined in quads that straddle the two paths)
	var hdOut = 0.0;
 var meadowOut = 0.0;
	if ( seabedPath ) {

		let underW = 1.0;
		let sandW = smoothstep( 0.3, 0.72, sp.x + ( dM.z - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.35 );
		// ---- seabed: sand with ripple fields, seagrass meadows, rubble heads
		let depth = -h;
 let reefW = reefWeight;
		var under = mix( vec3f(0.673859541,0.570481595,0.367246468), vec3f(0.476999785,0.447988412,0.295699805), smoothstep( 1.0, 9.0, depth ) );
		under = under * ( ( dM.w - 0.5 ) * 0.14 + 1.0 ) * ( ( grain - 0.45 ) * 0.25 + 1.0 );
		// megaripple fields (~0.75 m) across the swell, troughs collect darker shell hash; not in
		// the swash zone or the first metre of depth
		let fieldW = smoothstep( 0.42, 0.62, macroB + ( dM.w - 0.5 ) * 0.35 ) * smoothstep( 0.9, 2.0, depth ) * ( 1.0 - reefW );
		under = under * ( ( rip2 - 0.55 ) * 0.22 * fieldW * fade2 + 1.0 );
		// small wave ripples (~0.16 m) everywhere below the swash
		// seagrass meadows: ragged edges, blade streaks leaning with the wave surge, epiphyte tips
		// (the fringe breaks up into clumps: noise at three scales thresholds the soft splat edge)
		let clumps = ( dM.w - 0.5 ) * 0.5 + ( dN.y - 0.45 ) * 0.4 + ( macroB - 0.5 ) * 0.3;
		let seagrassW = smoothstep( 0.3, 0.55, sp.z + clumps ) * underW * smoothstep( 0.3, 0.9, depth );
		let swPerp = vec2f( -swDir.y, swDir.x );
		let blades = twGround_terDetail( vec2f( dot( xz, swDir ) / 2.6, dot( xz, swPerp ) / 0.35 ) ,terrainDetailTex,smpAniso4Repeat).y;
		var meadow = mix( vec3f(0.0134117489,0.0219809471,0.00598105957), vec3f(0.0592535211,0.0683848542,0.0196066485), smoothstep( 0.35, 0.75, blades ) );
		meadow = mix( meadow, vec3f(0.0469642007,0.0331047666,0.0116454309), smoothstep( 0.55, 0.8, dM.y + ( macroB - 0.5 ) * 0.4 ) * 0.5 );
		// sparse at the fringe: sand shows between the blades; thinner, paler patches inside
		meadow = mix( under, meadow, smoothstep( 0.3, 0.85, sp.z + clumps * 0.5 ) * 0.35 + 0.65 );
		meadow = mix( meadow, mix( meadow, under, 0.45 ), smoothstep( 0.58, 0.8, macroB + ( dM.w - 0.5 ) * 0.4 ) );
		under = mix( under, meadow, seagrassW );
		// rubble heads: coral rubble and rock turfed with algae, pink coralline crusts
		let rubbleW = smoothstep( 0.3, 0.6, sp.w + ( dN.x - 0.5 ) * 0.4 + ( dM.w - 0.5 ) * 0.3 ) * underW;
		var rubble = mix( vec3f(0.0331047666,0.0300741041,0.0196066485), vec3f(0.106539224,0.0889815256,0.0549717327), smoothstep( 0.3, 0.7, dN.x ) );
		rubble = mix( rubble, vec3f(0.0331047666,0.0469642007,0.0100228256), smoothstep( 0.5, 0.7, dF.y ) * 0.6 );
		rubble = mix( rubble, vec3f(0.295699805,0.119280188,0.162647194), smoothstep( 0.62, 0.74, dM.x ) * 0.6 );
		under = mix( under, rubble, rubbleW );
		// reef flat: coral rubble and pink crusts toward the reef
		under = mix( under, mix( vec3f(0.273838416,0.21404114,0.162647194), vec3f(0.318546778,0.154872486,0.178867504), smoothstep( 0.45, 0.7, dM.x ) ), reefW * 0.7 * smoothstep( 0.4, 0.6, dN.x ) );

		// damp sand below the berm (wet = 0 under water)
		let dampMottle = smoothstep( 0.3, 0.7, dM.w + ( dN.y - 0.45 ) * 0.6 + ( macroB - 0.5 ) * 0.4 );
		let wetK = smoothstep( 1.7, 0.5, h + dM.w * 0.3 ) * sandW * mix( 0.22, 0.5, dampMottle );
		let wetAlbedo = twGround_terrainSaturation( under * wetDarken, 1.15 ,terrainDetailTex,smpAniso4Repeat) * vec3f( 0.97, 0.98, 1.0 );
		albedoOut = mix( under, wetAlbedo, wetK );
		outRough = 0.75;
		let waveR = rip3 * 0.012 * fade3 * smoothstep( -0.3, -0.9, h ) * ( 1.0 - seagrassW );
		let megaR = rip2 * 0.035 * fade2 * fieldW * ( 1.0 - seagrassW );
		let sandH = grain * 0.004 + grainF * 0.003 + waveR + megaR;
		let seabedH = seagrassW * ( blades * 0.05 + 0.08 ) + rubbleW * ( dN.x * 0.07 + dF.x * 0.015 );
		hdOut = sandH + seabedH;
		outAO = nr.w * ( 1.0 - seagrassW * 0.3 ) * ( 1.0 - rubbleW * smoothstep( 0.55, 0.2, dN.x ) * 0.35 );
		meadowOut = 0.0;

	} else {

		// ---- detail samples (tileable heights: x rock, y soil, z sand, w fbm)
		// sand grain without the pebble peaks (pebbles are drawn separately where they belong)

		// ---- downslope streaks (rock flutes, hanging vegetation, landslide scars): the detail
		// texture stretched vertically on the two vertical projection planes
		let sw4 = pow( abs( N0.xz ), vec2f( 4.0 ) );
		let swN = sw4 / ( sw4.x + sw4.y + 1e-5 );
		// (everything they shape is weighted by the slope and vanishes at 0.28 or less: explicit
		// gradients in the branch, the same as the implicit ones of the full-screen quad)
		var streak = 0.5; var scar = 0.5;
		if ( slope > 0.28 ) {
			let stA = textureSampleGrad( terrainDetailTex, smpAniso4Repeat, vec2f( p.z / 9.3, h / 37.0 ), vec2f( dpx.z / 9.3, dpx.y / 37.0 ), vec2f( dpy.z / 9.3, dpy.y / 37.0 ) );
			let stB = textureSampleGrad( terrainDetailTex, smpAniso4Repeat, vec2f( p.x / 9.3 + 0.5, h / 37.0 + 0.3 ), vec2f( dpx.x / 9.3, dpx.y / 37.0 ), vec2f( dpy.x / 9.3, dpy.y / 37.0 ) );
			streak = stA.w * swN.x + stB.w * swN.y;
			scar = stA.y * swN.x + stB.y * swN.y;
		}

		// ---- rock: only evaluated where the rock mask or the slope allow it. Exposure follows the
		// form: steep faces, convex spurs and ridges (high AO) go bare, gully floors (low AO,
		// drainage lines) keep soil and plants; noise and fall-line streaks break the outline up.
		// Around the bare rock a band of scree / dark soil and moss; plants creep over it.
		let gully = sp.z * smoothstep( -0.5, 0.5, h );
		var rockAlbedo = vec3f( 0.2 ); var rockRough = 0.8; var rockHd = 0.0;
		var rockW = 0.0; var screeW = 0.0;
		let cliffK = smoothstep( 0.28, 0.55, slope );
		let convex = smoothstep( 0.5, 0.85, nr.w );
		// rv below, without the rock's own relief term, which adds at most 0.1925 (R.height <= 1): where
		// even that can't reach the scree band (0.28), rock and scree weigh 0 and the rock isn't shaded
		let rvBound = nr.z * 0.7 + smoothstep( 0.3, 0.62, slope ) * 0.5 + convex * 0.14 - gully * 0.4
			+ ( dM.w - 0.5 ) * 0.34 + ( dN.w - 0.5 ) * 0.22 + ( streak - 0.5 ) * 1.0 * cliffK + 0.2;
		if ( ( nr.z > 0.06 || slope > 0.3 ) && rvBound > 0.28 ) {

			var g: twGround_RockGrad;
			g.dpdx = dpx; g.dpdy = dpy; g.fwY = fwY; g.useGrad = true;
			let R = twGround_terrainRockSurface( p, N0, h, mcr, 0.5, 1.0, g ,terrainDetailTex,smpAniso4Repeat);
			let rv = nr.z * 0.7 + smoothstep( 0.3, 0.62, slope ) * 0.5 + convex * 0.14 - gully * 0.4
				+ ( R.height - 0.45 ) * 0.35 + ( dM.w - 0.5 ) * 0.34 + ( dN.w - 0.5 ) * 0.22
				+ ( streak - 0.5 ) * 1.0 * cliffK;
			// fades to 0 at the branch boundary: no step along the slope / mask iso-lines
			let branchK = max( smoothstep( 0.06, 0.18, nr.z ), smoothstep( 0.3, 0.42, slope ) );
			rockW = smoothstep( 0.5, 0.68, rv ) * branchK;
			screeW = smoothstep( 0.28, 0.52, rv ) * branchK * ( 1.0 - rockW );
			// weathered basalt: darker and browner than the sea-cliff palette, streaked; moss and
			// ferns on the ledges and on the less steep parts of the faces
			// dark wet stains down the fall line, paler dry ribs between them
			let stain = smoothstep( 0.5, 0.7, streak ) * cliffK;
			// dark, weathered basalt (the island's inland rock is darker and browner than the pale
			// sea-cliff palette), stained down the fall line
			var basalt = R.albedo * vec3f( 0.36, 0.34, 0.31 ) * ( 1.0 - stain * 0.45 ) * ( smoothstep( 0.42, 0.25, streak ) * cliffK * 0.15 + 1.0 );
			// soil and humus caught in the joints and hollows of the rock (low relief), so the face
			// reads as fractured stone instead of a smooth plate
			let joints = smoothstep( 0.42, 0.22, R.height + ( dN.w - 0.5 ) * 0.25 );
			basalt = mix( basalt, mix( vec3f(0.0153252033,0.0100228256,0.00598105957), vec3f(0.0331047666,0.0331047666,0.0100228256), dF.y ), joints * 0.7 );
			// moss / small plants on every ledge and on the less steep parts, more near the edges
			let ledgeMoss = smoothstep( 0.4, 0.75, N0.y + ( dN.y - 0.45 ) * 0.6 ) * smoothstep( 0.25, 0.55, macroB + dM.y * 0.4 );
			let fringe = smoothstep( 0.5, 0.58, rv ) * smoothstep( 0.8, 0.6, rv ) * smoothstep( 0.3, 0.6, dM.w + dN.y * 0.4 );
			let mossK = twGround_sat( max( ledgeMoss * 0.75, fringe * 0.8 ) + R.moss * 0.3 + joints * 0.25 ,terrainDetailTex,smpAniso4Repeat);
			rockAlbedo = mix( basalt, mix( vec3f(0.0134117489,0.0245150137,0.0039359395), vec3f(0.0396819095,0.0549717327,0.00854038211), dF.y ), mossK );
			rockRough = R.rough;
			// craggier than the boulders: the big blocks and plates stand out from afar
			rockHd = R.hd * 2.2 + R.height * 0.6;

		}

		// ---- weights
		let notRock = 1.0 - rockW;
		let underW = smoothstep( 0.12, -0.6, h );
		let landW = 1.0 - underW;
		let sandW = smoothstep( 0.3, 0.72, sp.x + ( dM.z - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.35 ) * notRock;
		let pathW = smoothstep( 0.28, 0.62, sp.y + ( dN.y - 0.45 ) * 0.4 + ( dM.w - 0.5 ) * 0.25 ) * notRock * landW
			* ( 1.0 - smoothstep( 50.0, 220.0, camDist ) * 0.85 );
		// forest on the higher / steeper ground and in the gullies, tall-grass meadow on the valley
		// floor and around the village (same classification as the vegetation's land cover)
		let jungleW = twGround_sat( smoothstep( 9.0, 24.0, h + ( mcr - 0.5 ) * 18.0 ) + smoothstep( 0.18, 0.36, slope ) + gully * 0.6 ,terrainDetailTex,smpAniso4Repeat);
		// landslide scars: raw red-brown laterite in streaks down steep slopes, rare
		let lateriteW = smoothstep( 0.62, 0.74, scar + ( macroB - 0.5 ) * 0.3 ) * smoothstep( 0.3, 0.42, slope )
			* smoothstep( 0.52, 0.66, mcr ) * notRock * 0.85;

		// ---- beach sand: pale coral sand, drifts of warmer / coarser sand, grain
		let dryK = smoothstep( 0.8, 3.0, h );
		var sand = mix( vec3f(0.655930683,0.522521554,0.318546778), vec3f(0.787412289,0.673859541,0.476999785), smoothstep( 0.3, 0.72, mcr + dryK * 0.2 ) );
		sand = mix( sand, vec3f(0.673859541,0.476999785,0.263273408), smoothstep( 0.55, 0.8, dM.w + ( macroB - 0.5 ) * 0.6 ) * 0.45 );
		sand = sand * ( ( dM.w - 0.5 ) * 0.16 + 1.0 ) * ( ( dN.w - 0.5 ) * 0.1 + 1.0 );
		sand = sand * ( ( grain - 0.45 ) * 0.3 + 0.97 ) * ( ( grainF - 0.45 ) * 0.2 + 1.0 );
		// disturbed / trodden patches: slightly darker, coarser sand (footfall, crabs, wind scour)
		let trod = smoothstep( 0.52, 0.7, dN.y + ( dM.y - 0.5 ) * 0.6 ) * dryK;
		sand = sand * ( 1.0 - trod * 0.07 );
		// the high-water band collects shell grit, coral bits and dried seaweed
		let hw = h + ( dM.w - 0.5 ) * 0.5;
		let wrackBand = smoothstep( 1.15, 1.4, hw ) * smoothstep( 2.1, 1.7, hw );
		let pebDensity = smoothstep( 0.62, 0.85, macroB + dM.w * 0.3 ) * 0.2 + wrackBand * smoothstep( 0.3, 0.6, dM.y );
		let pebW = smoothstep( 0.66, 0.8, dN.z ) * twGround_sat( pebDensity ,terrainDetailTex,smpAniso4Repeat) * smoothstep( 0.6, 0.9, sp.x ) * landW
			* ( 1.0 - smoothstep( 12.0, 35.0, camDist ) );
		let pebCol = mix( mix( vec3f(0.71056649,0.638283215,0.50707851), vec3f(0.570481595,0.367246468,0.318546778), smoothstep( 0.45, 0.75, dM.x ) ), vec3f(0.106539224,0.0889815256,0.0732389559), smoothstep( 0.74, 0.82, dM.y ) );
		sand = mix( sand, pebCol, pebW * 0.75 );
		let wrack = wrackBand * smoothstep( 0.58, 0.72, dN.y ) * smoothstep( 0.4, 0.6, macroB );
		sand = mix( sand, vec3f(0.0469642007,0.027211781,0.0116454309), wrack * 0.8 );
		// trampled sand along the paths
		sand = sand * ( 1.0 - pathW * 0.07 );

		// wind ripples on the dry sand: crests across the wind (bent by the fbm), wavelength
		// ~10.5 cm, fading where trodden; visible in the albedo too (finer sand on the crests).
		// (A wavelength varying in space must not divide the absolute coordinate: the phase then
		// swings by x * dλ / λ², which at 100 m from the origin turned the ripples into patches
		// of random direction and spacing with seams and moiré, and made fwidth switch them off
		// in blotches. The spacing varies through the smooth warp instead.)
		let wd = windDirection;
		let ph1 = dot( xz, wd ) * ( 6.2832 / 0.105 ) + dM.w * 24.0 + dN.w * 7.0 + macroB * 30.0;
		let fade1 = 1.0 - smoothstep( 0.6, 2.2, fwidth( ph1 ) );
		let rip1 = pow( sin( ph1 ) * 0.5 + 0.5, 1.6 );
		let windK = fade1 * smoothstep( 1.5, 2.2, h ) * ( 1.0 - pathW ) * ( 1.0 - trod * 0.7 )
			* smoothstep( 0.2, 0.5, macroB + dM.w * 0.3 );
		sand = sand * ( ( rip1 - 0.5 ) * 0.12 * windK + 1.0 );

		// ---- seabed: sand with ripple fields, seagrass meadows, rubble heads (only below the berm:
		// everything here is weighted by underW, 0 on land)
		let depth = -h;
		var fieldW = 0.0; var seagrassW = 0.0; var blades = 0.0; var rubbleW = 0.0;
		var under = sand;
		if ( underW > 0.0 ) {
 let reefW = reefWeight;
			under = mix( vec3f(0.673859541,0.570481595,0.367246468), vec3f(0.476999785,0.447988412,0.295699805), smoothstep( 1.0, 9.0, depth ) );
			under = under * ( ( dM.w - 0.5 ) * 0.14 + 1.0 ) * ( ( grain - 0.45 ) * 0.25 + 1.0 );
			// megaripple fields (~0.75 m) across the swell, troughs collect darker shell hash; not in
			// the swash zone or the first metre of depth
			fieldW = smoothstep( 0.42, 0.62, macroB + ( dM.w - 0.5 ) * 0.35 ) * smoothstep( 0.9, 2.0, depth ) * ( 1.0 - reefW );
			under = under * ( ( rip2 - 0.55 ) * 0.22 * fieldW * fade2 + 1.0 );
			// small wave ripples (~0.16 m) everywhere below the swash
			// seagrass meadows: ragged edges, blade streaks leaning with the wave surge, epiphyte tips
			// (the fringe breaks up into clumps: noise at three scales thresholds the soft splat edge)
			let clumps = ( dM.w - 0.5 ) * 0.5 + ( dN.y - 0.45 ) * 0.4 + ( macroB - 0.5 ) * 0.3;
			seagrassW = smoothstep( 0.3, 0.55, sp.z + clumps ) * underW * smoothstep( 0.3, 0.9, depth );
			let swPerp = vec2f( -swDir.y, swDir.x );
			blades = twGround_terDetail( vec2f( dot( xz, swDir ) / 2.6, dot( xz, swPerp ) / 0.35 ) ,terrainDetailTex,smpAniso4Repeat).y;
			var meadow = mix( vec3f(0.0134117489,0.0219809471,0.00598105957), vec3f(0.0592535211,0.0683848542,0.0196066485), smoothstep( 0.35, 0.75, blades ) );
			meadow = mix( meadow, vec3f(0.0469642007,0.0331047666,0.0116454309), smoothstep( 0.55, 0.8, dM.y + ( macroB - 0.5 ) * 0.4 ) * 0.5 );
			// sparse at the fringe: sand shows between the blades; thinner, paler patches inside
			meadow = mix( under, meadow, smoothstep( 0.3, 0.85, sp.z + clumps * 0.5 ) * 0.35 + 0.65 );
			meadow = mix( meadow, mix( meadow, under, 0.45 ), smoothstep( 0.58, 0.8, macroB + ( dM.w - 0.5 ) * 0.4 ) );
			under = mix( under, meadow, seagrassW );
			// rubble heads: coral rubble and rock turfed with algae, pink coralline crusts
			rubbleW = smoothstep( 0.3, 0.6, sp.w + ( dN.x - 0.5 ) * 0.4 + ( dM.w - 0.5 ) * 0.3 ) * underW;
			var rubble = mix( vec3f(0.0331047666,0.0300741041,0.0196066485), vec3f(0.106539224,0.0889815256,0.0549717327), smoothstep( 0.3, 0.7, dN.x ) );
			rubble = mix( rubble, vec3f(0.0331047666,0.0469642007,0.0100228256), smoothstep( 0.5, 0.7, dF.y ) * 0.6 );
			rubble = mix( rubble, vec3f(0.295699805,0.119280188,0.162647194), smoothstep( 0.62, 0.74, dM.x ) * 0.6 );
			under = mix( under, rubble, rubbleW );
			// reef flat: coral rubble and pink crusts toward the reef
			under = mix( under, mix( vec3f(0.273838416,0.21404114,0.162647194), vec3f(0.318546778,0.154872486,0.178867504), smoothstep( 0.45, 0.7, dM.x ) ), reefW * 0.7 * smoothstep( 0.4, 0.6, dN.x ) );
		}
		sand = mix( sand, under, underW );

		// ---- ground: tall-grass meadow (tone shared with the grass field), forest floor and, from
		// afar, the forest canopy; laterite scars
		let V = normalize( cameraPosition - p );
		let NdV = twGround_sat( dot( N0, V ) ,terrainDetailTex,smpAniso4Repeat);
		let mt = twGround_terrainMeadowTone( macroA, macroB, slope, N0.z, dM.w * 0.65 + dN.w * 0.35, true ,terrainDetailTex,smpAniso4Repeat);
		// clumps (1-3 m) and tussocks, blade-scale grain
		let clump = dM.w * 0.6 + dN.y * 0.4;
		// seen from afar the tussocks and their shadowed gaps are what makes tall grass read as
		// grass (not lawn): the clump contrast grows with distance as the blades fade out
		let clumpK = mix( 0.34, 0.95, smoothstep( 40.0, 140.0, camDist ) );
		var lawn = mt.tone * ( ( clump - 0.5 ) * clumpK + 1.0 ) * ( ( dF.y - 0.4 ) * 0.22 + 1.0 );
		lawn = lawn * mix( 1.0, smoothstep( 0.25, 0.55, dN.y * 0.5 + dM.y * 0.5 ) * 0.35 + 0.72, smoothstep( 50.0, 160.0, camDist ) );
		// grass combed along the wind: long streaks (anisotropic sample of the fbm channel)
		// (comb and gust only where the lawn shows: not under full forest, sand or water)
		let lawnShows = jungleW < 1.0 && landW > 0.0 && sandW < 1.0;
		var comb = 0.5;
		if ( lawnShows ) {
			let combUV = vec2f( dot( xz, windDirection ) / 7.5, dot( xz, vec2f( -windDirection.y, windDirection.x ) ) / 0.9 );
			comb = twGround_terDetail( combUV + vec2f( 0.31, 0.77 ) ,terrainDetailTex,smpAniso4Repeat).w;
			lawn = lawn * ( ( comb - 0.5 ) * 0.3 + 1.0 );
		}
		// seen from above the dark soil shows between the clumps; at grazing angles blade sides
		// cover everything (lighter, more saturated)
		let gapK = smoothstep( 0.3, 0.95, NdV ) * smoothstep( 0.62, 0.3, clump );
		lawn = mix( lawn, MEADOW_soil, gapK * 0.45 );
		lawn = mix( lawn, twGround_terrainSaturation( lawn * 1.12, 1.15 ,terrainDetailTex,smpAniso4Repeat), smoothstep( 0.45, 0.1, NdV ) * 0.6 );
		// travelling gusts flatten the grass: the paler blade backs show as waves (same gust
		// field as the grass blades)
		let windStrength = max( windSpeed * 0.1, 0.03 );
		if ( lawnShows ) {
			let gust = twGround_terGustAt( xz, gustOffset ,terrainDetailTex,smpAniso4Repeat) * twGround_sat( windStrength * 0.5 ,terrainDetailTex,smpAniso4Repeat);
			lawn = mix( lawn, lawn * vec3f( 1.25, 1.22, 1.06 ) + 0.01, gust * 0.6 );
		}
		// bare trodden soil in places, sandy soil toward the beach
		lawn = mix( lawn, vec3f(0.132868322,0.0889815256,0.0432336359), smoothstep( 0.72, 0.84, dN.y + ( dM.y - 0.5 ) * 0.5 ) * 0.25 );
		lawn = mix( lawn, vec3f(0.318546778,0.233021999,0.119280188), twGround_sat( sp.x * 1.6 ,terrainDetailTex,smpAniso4Repeat) * smoothstep( 0.45, 0.62, dN.z + dM.y * 0.3 ) * 0.7 );
		// inside the geometric grass field (GrassField) the ground is only seen between the blades:
		// the shaded base of the sward, dark and brownish with dead leaves; it hands over to the
		// sward's own look (above) where the blades thin out
		let grassHere = smoothstep( 2.5, 4.5, h ) * ( 1.0 - smoothstep( 0.45, 0.85, jungleW ) ) * ( 1.0 - twGround_sat( sp.x * 1.6 ,terrainDetailTex,smpAniso4Repeat) );
		let fieldK = ( 1.0 - smoothstep( 62.0, 87.0, length( p.xz - cameraPosition.xz ) ) ) * grassHere;
		let swardBase = mix( mt.tone * 0.4, MEADOW_soil, 0.4 ) * ( ( dN.y - 0.45 ) * 0.6 + 1.0 ) * ( ( dF.y - 0.4 ) * 0.3 + 1.0 );
		lawn = mix( lawn, swardBase, fieldK * 0.85 );
		let litter = mix( vec3f(0.0331047666,0.0196066485,0.00854038211), vec3f(0.0946296266,0.0508760882,0.0153252033), dF.y );
		var jungle = mix( vec3f(0.0100228256,0.0219809471,0.0039359395), litter, smoothstep( 0.52, 0.7, dN.y ) );
		jungle = mix( jungle, vec3f(0.0134117489,0.0100228256,0.00489631008), gully * 0.3 );
		let far = smoothstep( 40.0, 160.0, camDist );
		var cover = mix( vec3f(0.00719440929,0.0153252033,0.00309597523), vec3f(0.0245150137,0.0469642007,0.00598105957), smoothstep( 0.3, 0.7, mcr ) );
		cover = mix( cover, vec3f(0.0592535211,0.0683848542,0.0134117489), smoothstep( 0.66, 0.84, macroB + dM.w * 0.2 ) * 0.45 );
		jungle = mix( jungle, cover, far * 0.8 );
		jungle = jungle * ( ( mcr - 0.5 ) * 0.3 + 1.0 );
		// canopy: seen from a distance (or on slopes too steep for the trees) the forest reads as
		// a carpet of lumpy crowns with dark gaps
		let canopyW = jungleW * max( smoothstep( 0.2, 0.4, slope ), smoothstep( 90.0, 260.0, camDist ) ) * smoothstep( 25.0, 70.0, camDist ) * notRock * ( 1.0 - screeW * 0.7 );
		var canopyH = 0.0;
		if ( canopyW > 0.0 ) {
			let crowns = twGround_terDetail( (mat2x2f(0.6216099682706644,0.7833269096274834,-0.7833269096274834,0.6216099682706644)*(xz)) / 61.0 ,terrainDetailTex,smpAniso4Repeat).w;
			let crownsB = twGround_terDetail( (mat2x2f(-0.666276021279824,0.7457052121767203,-0.7457052121767203,-0.666276021279824)*(xz)) / 13.0 + 0.37 ,terrainDetailTex,smpAniso4Repeat).w;
			canopyH = smoothstep( 0.32, 0.7, crowns * 0.45 + crownsB * 0.4 + dM.w * 0.15 );
			var canopy = mix( vec3f(0.0039359395,0.00719440929,0.00193498452), mix( vec3f(0.0173891024,0.0363064841,0.00489631008), vec3f(0.0396819095,0.0592535211,0.00854038211), macroB ), canopyH );
			// steep faces: the canopy hangs in streaks down the fall line
			canopy = canopy * ( ( streak - 0.5 ) * 0.5 * smoothstep( 0.3, 0.5, slope ) + 1.0 );
			jungle = mix( jungle, canopy, canopyW );
		}
		var ground = mix( lawn, jungle, jungleW );
		// around the bare rock: dark humus, stones and moss, with the surrounding plants creeping
		// in (a soft, noisy band; no speckle)
		let creepIn = smoothstep( 0.4, 0.75, dM.w + ( dN.y - 0.45 ) * 0.5 + ( macroB - 0.5 ) * 0.3 );
		var scree = mix( vec3f(0.0219809471,0.0153252033,0.0100228256), vec3f(0.0592535211,0.0469642007,0.0331047666), smoothstep( 0.45, 0.75, dM.x + ( dN.x - 0.5 ) * 0.3 ) );
		scree = mix( scree, mix( vec3f(0.0153252033,0.027211781,0.00489631008), vec3f(0.0396819095,0.0549717327,0.00854038211), dF.y ), smoothstep( 0.45, 0.7, dM.y + ( dN.y - 0.45 ) * 0.5 ) * 0.7 );
		ground = mix( ground, scree, screeW * ( 1.0 - creepIn * 0.7 ) );
		let laterite = mix( vec3f(0.147318999,0.0508760882,0.0219809471), vec3f(0.233021999,0.106539224,0.0469642007), dM.w ) * ( ( dN.y - 0.4 ) * 0.3 + 1.0 );
		ground = mix( ground, laterite, lateriteW );

		// ---- worn dirt paths / trampled ground (darker, redder soil in the forest)
		var dirt = mix( vec3f(0.119280188,0.0782883196,0.0432336359), vec3f(0.21404114,0.154872486,0.0835351274), dM.w ) * ( ( dN.y - 0.4 ) * 0.35 + 0.95 );
		dirt = mix( dirt, vec3f(0.0732389559,0.0396819095,0.0196066485), jungleW * 0.7 );
		dirt = mix( dirt, vec3f(0.273838416,0.242866814,0.195994179), smoothstep( 0.72, 0.82, dN.z ) * 0.5 );
		// grass creeping onto the trail, a grassy strip between the two worn ruts
		let creep = smoothstep( 0.45, 0.7, dN.y + ( dF.y - 0.45 ) * 0.5 ) * smoothstep( 0.9, 0.5, sp.y );
		dirt = mix( dirt, lawn, creep * 0.8 );

		// ---- combine
		let meadowW = ( 1.0 - jungleW ) * ( 1.0 - pathW ) * notRock * ( 1.0 - sandW ) * landW * ( 1.0 - screeW );
		meadowOut = meadowW;
		var albedo = mix( ground, dirt, pathW );
		albedo = mix( albedo, sand, max( sandW, underW * notRock ) );
		albedo = mix( albedo, rockAlbedo, rockW );

		// ---- eroded beach scarp (splat alpha on land): storm-cut face of the foredune. Layered
		// sandy soil (laminae of paler and darker sand, darker humus-stained patches), live roots
		// and pale dead-root tangles hanging out of the face, damp darker sand at the toe.
		let scarpW = twGround_sat( sp.w * 1.6 ,terrainDetailTex,smpAniso4Repeat) * landW * notRock;
		var scarpH = 0.0;
		if ( scarpW > 0.003 ) {

			// laminae: thin storm layers, warped and wedging out, with a set of cross-beds at a low angle
			let tanF = normalize( vec2f( -N0.z, N0.x ) + vec2f( 1e-4, 0.0 ) );
			let alongF = dot( xz, tanF );
			let hw = h + ( dM.w - 0.5 ) * 0.5 + ( dN.w - 0.5 ) * 0.12 + ( macroB - 0.5 ) * 0.35;
			let lam = sin( hw * ( 6.2832 / 0.11 ) + dN.x * 2.0 ) * 0.5 + 0.5;
			let cross = sin( ( hw + alongF * 0.09 ) * ( 6.2832 / 0.075 ) ) * 0.5 + 0.5;
			let lamB = smoothstep( 0.3, 0.7, sin( ( hw + dM.y * 0.4 ) * ( 6.2832 / 0.43 ) ) * 0.5 + 0.5 );
			let layerMix = mix( lam, cross, smoothstep( 0.4, 0.6, dM.x ) );
			var soil = mix( vec3f(0.21404114,0.147318999,0.0782883196), vec3f(0.420033289,0.318546778,0.178867504), smoothstep( 0.3, 0.8, layerMix ) * 0.45 + lamB * 0.2 + ( grain - 0.45 ) * 0.5 + ( dM.w - 0.5 ) * 0.3 );
			// humus-stained, rootier soil in patches (the old dune surface caught in the cut)
			soil = mix( soil, vec3f(0.0549717327,0.0331047666,0.0173891024), smoothstep( 0.55, 0.8, dM.y + ( macroB - 0.5 ) * 0.5 ) * 0.55 );
			// roots: horizontal coordinate along the face, stretched down the fall line
			let ru = twGround_terDetail( vec2f( dot( xz, tanF ) / 0.8, h / 0.5 ) + vec2f( 0.37, 0.11 ) ,terrainDetailTex,smpAniso4Repeat);
			let rv = twGround_terDetail( vec2f( dot( xz, tanF ) / 1.7 + h * 0.6, h / 0.9 ) + vec2f( 0.71, 0.29 ) ,terrainDetailTex,smpAniso4Repeat);
			let rootLive = smoothstep( 0.035, 0.0, abs( ru.x - 0.5 ) ) * smoothstep( 0.45, 0.62, ru.w );
			let rootDead = smoothstep( 0.03, 0.0, abs( rv.z - 0.52 ) ) * smoothstep( 0.5, 0.66, rv.y );
			soil = mix( soil, vec3f(0.0245150137,0.0134117489,0.00719440929), rootLive * 0.85 );
			soil = mix( soil, vec3f(0.603827339,0.522521554,0.39312313), rootDead * 0.75 );
			// damp, darker sand toward the toe and in seepage streaks
			let seep = smoothstep( 0.6, 0.8, twGround_terDetail( vec2f( dot( xz, tanF ) / 2.3, h / 6.0 ) ,terrainDetailTex,smpAniso4Repeat).w ) * 0.35;
			soil = soil * ( 1.0 - seep - smoothstep( 0.5, 1.0, sp.w ) * 0.08 );
			// under the lip: the dark, rooty topsoil the grass grows in, overhanging the cut
			let lip = smoothstep( 0.86, 0.97, sp.w + ( dN.y - 0.45 ) * 0.1 );
			soil = mix( soil, vec3f(0.0331047666,0.0196066485,0.0100228256) * ( dN.x * 0.4 + 0.8 ), lip * 0.85 );
			// foot of the face: undercut by the swash of storm waves, in its own shadow
			soil *= 1.0 - ( 1.0 - smoothstep( 0.6, 0.78, sp.w ) ) * smoothstep( 0.35, 0.55, sp.w ) * 0.25;
			// slumped sand and fallen chunks at the toe: damp beach sand rather than soil
			soil = mix( vec3f(0.354692061,0.273838416,0.162647194) * ( grain * 0.3 + 0.85 ), soil, smoothstep( 0.35, 0.75, sp.w ) );
			albedo = mix( albedo, soil, scarpW );
			scarpH = ( lip * 0.03 + layerMix * 0.012 + lamB * 0.018 + rootLive * 0.012 + rootDead * 0.009 + dN.x * 0.025 );

		}

		// ---- wetness (swash zone) from the shore system, else a static damp band
		let wetFoam = wetFoam;
		let wet = twGround_sat( wetFoam.x ,terrainDetailTex,smpAniso4Repeat) * ( 1.0 - jungleW * 0.8 ) * landW;
		// damp sand below the berm: darker in mottled, drying patches even when the swash has not
		// reached it lately
		let dampMottle = smoothstep( 0.3, 0.7, dM.w + ( dN.y - 0.45 ) * 0.6 + ( macroB - 0.5 ) * 0.4 );
		let damp = smoothstep( 1.7, 0.5, h + dM.w * 0.3 ) * sandW * mix( 0.22, 0.5, dampMottle );
		// sand dries in mottled patches; backwash leaves faint rills down the slope
		let mottle = smoothstep( 0.25, 0.75, dM.w + ( dN.y - 0.45 ) * 0.5 );
		let dryEdge = smoothstep( 0.0, 0.6, wet ) * smoothstep( 1.0, 0.6, wet );
		let wetK = max( wet, damp ) * ( 1.0 - dryEdge * mottle * 0.6 ) * notRock;
		let slopeDir = normalize( N0.xz + vec2f( 1e-4, 0.0 ) );
		let rillK = smoothstep( 0.2, 0.9, wet ) * smoothstep( 0.05, 0.6, h ) * sandW;
		var rill = 0.5;
		if ( rillK > 0.0 ) { rill = twGround_terDetail( vec2f( dot( xz, slopeDir ) / 3.2, dot( xz, vec2f( -slopeDir.y, slopeDir.x ) ) / 0.3 ) ,terrainDetailTex,smpAniso4Repeat).w; }
		let wetAlbedo = twGround_terrainSaturation( albedo * wetDarken, 1.15 ,terrainDetailTex,smpAniso4Repeat) * vec3f( 0.97, 0.98, 1.0 ) * ( ( rill - 0.5 ) * 0.25 * rillK + 1.0 );
		albedo = mix( albedo, wetAlbedo, wetK );
		// swash marks: thin wavy lines of grit left at the limits of earlier uprushes
		let sl = ( h + dM.w * 0.18 + dN.w * 0.05 ) / 0.13;
		let slD = abs( fract( sl ) - 0.5 );
		let slW = fwidth( sl ) + 1e-4;
		let swashLine = smoothstep( slW * 1.5 + 0.04, 0.0, slD ) * smoothstep( 0.2, 0.4, h ) * smoothstep( 1.6, 1.2, h )
			* smoothstep( 0.45, 0.65, dM.y + ( macroB - 0.5 ) * 0.4 ) * sandW * ( 1.0 - smoothstep( 0.8, 2.0, slW * 10.0 ) );
		albedo = mix( albedo * ( 1.0 - swashLine * 0.3 ), vec3f(0.787412289,0.748414103,0.673859541), swashLine * smoothstep( 0.6, 0.75, dF.z ) * 0.5 );
		// foam residue: lacy patterns stranded on the sand
		var residue = twGround_sat( wetFoam.y ,terrainDetailTex,smpAniso4Repeat) * landW * notRock;
		if ( residue > 0.0 ) { residue *= smoothstep( 0.42, 0.18, twGround_terDetail( (mat2x2f(0.9210609940028851,0.3894183423086505,-0.3894183423086505,0.9210609940028851)*(xz)) / 0.9 ,terrainDetailTex,smpAniso4Repeat).x ) * 0.7 + 0.3; }
		albedo = mix( albedo, vec3f(0.748414103,0.787412289,0.787412289), residue );

		// ---- roughness
		var rough = mix( 0.88, 0.93, sandW );
		rough = mix( rough, 0.9, pathW );
		rough = mix( rough, rockRough, rockW );
		// wet sand has a film of water: glossy while fresh, satin as it drains
		rough = mix( rough, mix( 0.42, 0.16, wet ), wetK );
		rough = mix( rough, 0.7, residue );
		rough = mix( rough, 0.75, underW );
		rough = mix( rough, 0.94, scarpW );
		outRough = rough;

		// ---- micro relief for the normal
		let windR = rip1 * 0.005 * windK;
		let waveR = rip3 * 0.012 * fade3 * smoothstep( -0.3, -0.9, h ) * ( 1.0 - seagrassW );
		let megaR = rip2 * 0.035 * fade2 * fieldW * ( 1.0 - seagrassW );
		let sandH = ( grain * 0.004 + grainF * 0.003 + pebW * 0.004 + windR + waveR + megaR ) * ( 1.0 - wet * 0.6 )
			+ rill * 0.006 * rillK;
		// seagrass canopy stands proud of the sand with a ragged scarp; rubble is knobbly
		let seabedH = seagrassW * ( blades * 0.05 + 0.08 ) + rubbleW * ( dN.x * 0.07 + dF.x * 0.015 );
		let groundH = dN.y * mix( 0.05, 0.035, jungleW ) + dF.y * 0.012 + dM.y * 0.045 + canopyH * canopyW * 2.5
			+ clump * 0.12 * ( 1.0 - jungleW ) + comb * 0.03 * ( 1.0 - jungleW );
		let screeH = dN.z * 0.04 + dM.x * 0.06;
		let dirtH = dN.z * 0.012 + dN.y * 0.01;
		var hd = mix( mix( groundH, screeH, screeW ), dirtH, pathW );
		hd = mix( hd, sandH + seabedH, max( sandW, underW * notRock ) );
		hd = mix( hd, rockHd, rockW );
		hd = mix( hd, scarpH, scarpW );
		hdOut = hd;

		// ---- ambient occlusion: baked horizon + cavity, plus litter / crevices / seagrass canopy
		let aoDetail = mix( 1.0, dN.y * 0.5 + 0.7, jungleW * ( 1.0 - sandW ) * notRock * landW )
			* mix( 1.0, smoothstep( 0.2, 0.7, clump ) * 0.35 + 0.65, meadowW );
		outAO = nr.w * aoDetail * ( 1.0 - seagrassW * 0.3 ) * ( 1.0 - rubbleW * smoothstep( 0.55, 0.2, dN.x ) * 0.35 )
			* mix( 1.0, smoothstep( 0.15, 0.6, canopyH ) * 0.6 + 0.4, canopyW );

		albedoOut = albedo;

	}

	outN = twGround_terrainPerturbNormal( p, N0, hdOut, 1.0 ,terrainDetailTex,smpAniso4Repeat);

	return mat3x3f(albedoOut,outN,vec3f(outRough,twGround_sat(outAO,terrainDetailTex,smpAniso4Repeat),meadowOut));

}
const PAL_rockDark: vec3f = vec3f(0.0196066485,0.0184784733,0.0163381447);
const PAL_rockMid: vec3f = vec3f(0.0732389559,0.0660303346,0.0570892115);
const PAL_rockLight: vec3f = vec3f(0.195994179,0.174728005,0.147318999);
const PAL_rockWarm: vec3f = vec3f(0.162647194,0.112804787,0.0732389559);
const PAL_lichenPale: vec3f = vec3f(0.447988412,0.447988412,0.367246468);
const PAL_lichenOrange: vec3f = vec3f(0.570481595,0.21404114,0.0331047666);
const PAL_blackZone: vec3f = vec3f(0.00657140362,0.00657140362,0.00598105957);
const PAL_barnacle: vec3f = vec3f(0.570481595,0.538235524,0.447988412);
const PAL_algae: vec3f = vec3f(0.0331047666,0.0592535211,0.0100228256);
const PAL_coralline: vec3f = vec3f(0.34239164,0.162647194,0.178867504);
const PAL_moss: vec3f = vec3f(0.0300741041,0.0683848542,0.00719440929);
const PAL_mossDry: vec3f = vec3f(0.0732389559,0.0946296266,0.0173891024);
const MEADOW_lush: vec3f = vec3f(0.0153252033,0.0331047666,0.0039359395);
const MEADOW_green: vec3f = vec3f(0.0508760882,0.0835351274,0.0100228256);
const MEADOW_olive: vec3f = vec3f(0.106539224,0.112804787,0.0173891024);
const MEADOW_yellow: vec3f = vec3f(0.21404114,0.178867504,0.0331047666);
const MEADOW_straw: vec3f = vec3f(0.34239164,0.252950076,0.0889815256);
const MEADOW_soil: vec3f = vec3f(0.0245150137,0.0153252033,0.00719440929);

fn twGround_sat(x:f32,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler)->f32{return clamp(x,0.0,1.0);}
fn twGround_luminance(c:vec3f,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler)->f32{return dot(c,vec3f(.2126,.7152,.0722));}




struct twGround_RockGrad {
	dpdx: vec3f,
	dpdy: vec3f,
	fwY: f32,
	useGrad: bool,
};

// implicit-derivative twGround_RockGrad for a world position (call in uniform control flow)
fn twGround_terrainImplicitGrad( p: vec3f ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> twGround_RockGrad {
	var g: twGround_RockGrad;
	g.dpdx = dpdx( p ); g.dpdy = dpdy( p ); g.fwY = 0.0; g.useGrad = false;
	return g;
}

// Mikkelsen surface-gradient bump: perturb world normal N by the scalar height field hd
// (screen-space derivatives, so any mix of projections / scales works). Robustness for terrain:
//  - the tilt is limited to ~55 degrees (at grazing angles |det| collapses and the unclamped
//    gradient would swing the normal into the tangent plane: 'chrome' patches on steep faces)
//  - the bump fades out where the screen-space frame is degenerate (the thin sliver triangles
//    of CDLOD geomorphing, which otherwise light up as bright lines along the grid) or where the
//    rendered facet disagrees with N (sub-texel crags)
fn twGround_terrainPerturbNormal( p: vec3f, N: vec3f, hd: f32, scale: f32 ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> vec3f {
	let dpx = dpdx( p ); let dpy = dpdy( p );
	let dhdx = dpdx( hd ) * scale; let dhdy = dpdy( hd ) * scale;
	let r1 = cross( dpy, N );
	let r2 = cross( N, dpx );
	let det = dot( dpx, r1 );
	let ad = abs( det );
	let grad = ( r1 * dhdx + r2 * dhdy ) * sign( det );
	let area = length( cross( dpx, dpy ) );
	let fr = area / max( length( dpx ) * length( dpy ), 1e-20 ); // sin of the footprint angle
	let facet = ad / max( area, 1e-20 ); // cos between the facet and N
	let k = smoothstep( 0.12, 0.35, fr ) * smoothstep( 0.3, 0.6, facet );
	let g = grad * min( 1.0, ad * 1.4 / max( length( grad ), 1e-20 ) ) * k;
	return normalize( N * max( ad, 1e-20 ) - g );
}

// triplanar blend weights (sharp)
fn twGround_terrainTriWeights( N: vec3f ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> vec3f {
	let a = abs( N );
	let w = a * a * ( a * a );
	return w / ( w.x + w.y + w.z );
}

fn twGround_terrainDetailGrad( uv: vec2f, gx: vec2f, gy: vec2f ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> vec4f {
	return textureSampleGrad( terrainDetailTex, smpAniso4Repeat, uv, gx, gy );
}

// one channel-set of the detail texture, triplanar. The samples use explicit gradients (the
// derivatives of the world position in g), so they may run in non-uniform control flow.
fn twGround_terrainTriplanar( p: vec3f, w: vec3f, tile: f32, g: twGround_RockGrad ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> vec4f {
	let s = 1.0 / tile;
	let x = twGround_terrainDetailGrad( p.zy * s, g.dpdx.zy * s, g.dpdy.zy * s ,terrainDetailTex,smpAniso4Repeat);
	let y = twGround_terrainDetailGrad( p.xz * s + 0.37, g.dpdx.xz * s, g.dpdy.xz * s ,terrainDetailTex,smpAniso4Repeat);
	let z = twGround_terrainDetailGrad( p.xy * s + 0.71, g.dpdx.xy * s, g.dpdy.xy * s ,terrainDetailTex,smpAniso4Repeat);
	return x * w.x + y * w.y + z * w.z;
}

struct twGround_RockSurface {
	albedo: vec3f,
	rough: f32,
	hd: f32,     // bump height (m)
	moss: f32,   // 0..1
	wet: f32,
	height: f32,
};

// Weathered volcanic rock seen on the headlands, sea stacks and boulders.
//   p world position, N world normal (geometric / mcr), h height above sea level
//   mcr: 0..1 large scale variation, seed: per object variation (0..1)
// With g.useGrad every sample uses the gradients in g (branch safe).
fn twGround_terrainRockSurface( p: vec3f, N: vec3f, h: f32, mcr: f32, seed: f32, mossAmount: f32, g: twGround_RockGrad ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> twGround_RockSurface {
	let w = twGround_terrainTriWeights( N ,terrainDetailTex,smpAniso4Repeat);
	// big blocks (4 m cells), plates (0.9 m) and grain / chips
	let big = twGround_terrainTriplanar( p, w, 27.0, g ,terrainDetailTex,smpAniso4Repeat);
	let mid = twGround_terrainTriplanar( p, w, 6.1, g ,terrainDetailTex,smpAniso4Repeat);
	let fine = twGround_terrainTriplanar( p, w, 1.3, g ,terrainDetailTex,smpAniso4Repeat);
	// pixel footprint (m): features smaller than a few pixels fade out instead of sparkling
	let px = select( length( abs( g.dpdx ) + abs( g.dpdy ) ), max( length( g.dpdx ), length( g.dpdy ) ), g.useGrad );
	let fineK = 1.0 - smoothstep( 0.006, 0.02, px );
	let midK = 1.0 - smoothstep( 0.03, 0.1, px );
	let hr = big.x * 0.45 + mid.x * 0.35 + ( ( fine.x - 0.5 ) * fineK + 0.5 ) * 0.2;

	// layered lava flows / bedding on steep faces: irregular bands (1D lookup of the fbm channel
	// along the height, warped), faded out once a band gets thinner than a few pixels
	let steep = 1.0 - smoothstep( 0.55, 0.85, N.y );
	let bandY = p.y + mid.w * 2.5 + mcr * 6.0;
	var fwY = g.fwY;
	if ( ! g.useGrad ) { fwY = fwidth( bandY ); }
	let bandUV = vec2f( bandY / 14.0, seed * 0.37 + 0.13 );
	var strata: f32;
	if ( g.useGrad ) {
		strata = twGround_terrainDetailGrad( bandUV, vec2f( fwY / 14.0, 0.0 ), vec2f( 0.0 ) ,terrainDetailTex,smpAniso4Repeat).w;
	} else {
		strata = textureSample( terrainDetailTex, smpAniso4Repeat, bandUV ).w;
	}
	let strataAA = 1.0 - smoothstep( 0.15, 0.6, fwY );
	let tone = hr * 0.9 + ( mcr - 0.5 ) * 0.7 + ( strata - 0.5 ) * 0.8 * steep * strataAA + ( seed - 0.5 ) * 0.3;
	var col = mix( PAL_rockDark, PAL_rockMid, smoothstep( 0.1, 0.5, tone ) );
	col = mix( col, PAL_rockLight, smoothstep( 0.5, 0.85, tone ) );
	// iron staining / warm weathering in patches
	col = mix( col, PAL_rockWarm, smoothstep( 0.62, 0.8, mid.w + mcr * 0.3 ) * 0.18 );
	// joints between the big blocks, fainter between plates
	col = col * ( smoothstep( 0.05, 0.25, big.x ) * 0.35 + 0.65 ) * ( smoothstep( 0.05, 0.25, mid.x ) * 0.15 + 0.85 );
	// rain streaks: dark stains running down steep faces, paler bands between (the fbm channel
	// stretched vertically on the two vertical projection planes)
	let sUVa = vec2f( p.z / 3.1, p.y / 41.0 );
	let sUVb = vec2f( p.x / 3.1 + 0.5, p.y / 41.0 + 0.3 );
	let sa = twGround_terrainDetailGrad( sUVa, vec2f( g.dpdx.z / 3.1, g.dpdx.y / 41.0 ), vec2f( g.dpdy.z / 3.1, g.dpdy.y / 41.0 ) ,terrainDetailTex,smpAniso4Repeat);
	let sb = twGround_terrainDetailGrad( sUVb, vec2f( g.dpdx.x / 3.1, g.dpdx.y / 41.0 ), vec2f( g.dpdy.x / 3.1, g.dpdy.y / 41.0 ) ,terrainDetailTex,smpAniso4Repeat);
	let sw4 = pow( abs( N.xz ), vec2f( 4.0 ) );
	let stainS = ( sa.w * sw4.x + sb.w * sw4.y ) / ( sw4.x + sw4.y + 1e-5 );
	let stain = smoothstep( 0.52, 0.72, stainS ) * steep;
	col = col * ( 1.0 - stain * 0.4 ) * ( smoothstep( 0.35, 0.2, stainS ) * steep * 0.12 + 1.0 );

	// lichens on the dry upper faces
	let dry = smoothstep( 2.6, 4.0, h );
	let lichen = smoothstep( 0.6, 0.78, mid.y ) * smoothstep( 0.2, 0.7, N.y ) * dry * smoothstep( 0.45, 0.65, mcr );
	col = mix( col, PAL_lichenPale, lichen * 0.45 );
	col = mix( col, PAL_lichenOrange, smoothstep( 0.8, 0.88, mid.y ) * dry * smoothstep( 0.5, 0.8, N.y ) * 0.3 );

	// moss / grass on ledges and tops, ferns hanging along the bedding planes of steep faces
	let ledge = smoothstep( 0.55, 0.7, strata ) * steep * strataAA * smoothstep( 0.4, 0.6, mid.w + ( mcr - 0.5 ) * 0.4 );
	let moss = max( smoothstep( 0.62, 0.9, N.y + ( big.x - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.3 ), ledge * 0.8 )
		* smoothstep( 2.5, 5.0, h ) * mossAmount;
	col = mix( col, mix( PAL_moss, PAL_mossDry, mid.w ), moss * 0.9 );

	// shoreline zonation: black lichen band (splash zone), barnacles and algae in the intertidal
	let splash = smoothstep( 0.5, 1.0, h ) * smoothstep( 2.8, 1.8, h + mid.w * 1.2 ) * smoothstep( 0.35, 0.6, mcr + mid.w * 0.3 );
	col = mix( col, PAL_blackZone, splash * 0.55 );
	// sun-bleached, weathered upper faces
	col = mix( col, PAL_rockLight, smoothstep( 0.35, 0.95, N.y ) * smoothstep( 1.5, 3.0, h ) * 0.3 );
	let inter = smoothstep( -0.7, -0.2, h ) * smoothstep( 0.7, 0.2, h );
	let barn = smoothstep( 0.62, 0.72, fine.z ) * inter * fineK;
	col = mix( col, PAL_algae, inter * smoothstep( 0.4, 0.6, mid.y ) * 0.6 );
	col = mix( col, PAL_barnacle, barn * 0.8 );
	// below the water: algae films and pink coralline crusts
	let sub = smoothstep( -0.3, -1.2, h );
	col = mix( col, mix( PAL_algae, PAL_coralline, smoothstep( 0.45, 0.7, mid.w ) ), sub * 0.55 );

	// wet below the swash line (dark, glossy)
	let wet = smoothstep( 1.0, 0.25, h + mid.w * 0.3 );
	col = col * mix( 1.0, 0.55, wet );

	var r: twGround_RockSurface;
	r.albedo = col;
	r.rough = mix( mix( 0.88, 0.8, steep ), 0.45, wet ) + moss * 0.06;
	// relief (m): tilted blocks and plates with bevelled joints, then grain
	r.hd = big.x * 0.25 + mid.x * 0.07 * ( midK * 0.6 + 0.4 ) + fine.x * 0.012 * fineK * ( 1.0 - wet * 0.6 ) + barn * 0.005;
	r.moss = moss;
	r.wet = wet;
	r.height = hr;
	return r;
}

// saturation helper
fn twGround_terrainSaturation( c: vec3f, s: f32 ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> vec3f {
	return mix( vec3f( twGround_luminance( c ,terrainDetailTex,smpAniso4Repeat) ), c, s );
}

struct twGround_MeadowTone {
	tone: vec3f,
	dry: f32,
	lush: f32,
};

//   mA, mB: detail fbm channel at the 173 m / 47 m scales (~0.5 +- 0.1): the samples at
//   rot2( xz, 0.7 ) / 173 and rot2( xz, 2.1 ) / 47 that the terrain takes anyway; slope: 1 - N.y;
//   south: N.z (the sun side); detail: optional finer fbm (~0.5 +- 0.1) that breaks up the patches
//   (hasDetail = false: none)
// Returns { tone, dry, lush }: mostly fresh green grass with olive, sun-bleached yellow and a few
// straw-dry patches (more on exposed slopes), darker lush grass in the damp patches (the hollows
// are darkened further by the AO).
fn twGround_terrainMeadowTone( mA: f32, mB: f32, slope: f32, south: f32, detail: f32, hasDetail: bool ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> twGround_MeadowTone {
	var m = mA * 0.55 + mB * 0.45 + slope * 0.25 + south * 0.04;
	let dd = select( 0.0, detail - 0.5, hasDetail );
	m += dd * 0.28;
	let olive = smoothstep( 0.52, 0.6, m );
	let yellow = smoothstep( 0.6, 0.67, m );
	let straw = smoothstep( 0.66, 0.73, m + ( mB - 0.5 ) * 0.2 );
	let lush = smoothstep( 0.46, 0.37, mB * 0.7 + mA * 0.3 + slope * 0.2 + dd * 0.2 );
	var c = mix( MEADOW_green, MEADOW_olive, olive );
	c = mix( c, MEADOW_yellow, yellow * 0.8 );
	c = mix( c, MEADOW_straw, straw * 0.55 );
	c = mix( c, MEADOW_lush, lush * 0.75 );
	var o: twGround_MeadowTone;
	o.tone = c;
	o.dry = olive * 0.4 + yellow * 0.6;
	o.lush = lush;
	return o;
}
fn twGround_terGustAt( xz: vec2f, offset: vec2f ,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> f32 {
	let p = xz - offset;
	let n = textureSampleLevel( terrainDetailTex, smpAniso4Repeat, p / 140.0, 0.0 ).w * 0.62
		+ textureSampleLevel( terrainDetailTex, smpAniso4Repeat, p / 61.0 + 0.37, 0.0 ).w * 0.38;
	return smoothstep( 0.46, 0.6, n );
}fn twGround_terDetail(uv: vec2f,terrainDetailTex:texture_2d<f32>,smpAniso4Repeat:sampler) -> vec4f { return textureSample(terrainDetailTex,smpAniso4Repeat,uv); }`;

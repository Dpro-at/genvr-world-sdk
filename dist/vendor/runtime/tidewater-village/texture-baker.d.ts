/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import type { WgslModule } from './materials.js';
import type { VillageTextureName } from './materials.js';
export declare const noiseModule: WgslModule;
export declare const GENERATORS: {
    readonly wood: "\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\t// knots with grain flowing around them\n\tlet kw = vlgPwr( X, Y, 6.0, 10.0, 11.0, 0.7 );\n\tlet kHas = step( 0.9, kw.w );\n\tlet kRad = 0.01 + vlgHf( kw.w, 3.3 ) * 0.013;\n\tlet kdm = length( vec2f( kw.x * ( 2.0 / 6.0 ), kw.y * ( 1.0 / 10.0 ) ) );\n\tlet kInfl = exp( - ( kdm / ( kRad * 2.4 ) ) ) * kHas;\n\n\t// growth rings with uneven spacing and per-ring width / contrast\n\tlet warpA = vlgPf( X, Y, 2.0, 4.0, 3, 21.0, 0.5 );\n\tlet warpB = vlgPf( X, Y, 1.0, 2.0, 2, 23.0, 0.5 );\n\tlet r = Y * 110.0 + warpA * 5.0 + warpB * 14.0 + kInfl * 14.0;\n\tlet ringId = floor( r );\n\tlet ringIdW = ringId - floor( ringId / 110.0 ) * 110.0;\n\tlet w = fract( r );\n\tlet lw = mix( 0.09, 0.32, vlgHf( ringIdW, 5.1 ) );\n\tlet late = smoothstep( 0.93 - lw, 1.0 - lw, w ) * ( 1.0 - smoothstep( 0.9, 0.995, w ) );\n\tlet ringDark = mix( 0.65, 1.15, vlgHf( ringIdW, 9.7 ) );\n\n\t// dense fibre streaks along the grain (the signature of sun-weathered timber)\n\tlet fA = vlgN01( vlgPn( X, Y, 12.0, 300.0, 53.0 ) );\n\tlet fB = vlgN01( vlgPn( X, Y, 5.0, 140.0, 55.0 ) );\n\tlet fC = vlgN01( vlgPn( X, Y, 16.0, 400.0, 57.0 ) );\n\tlet streak = fA * 0.5 + fB * 0.3 + fC * 0.2;\n\tlet erosion = ( 1.0 - late ) * ( fB * 0.6 + 0.4 );\n\n\t// checks / cracks along the grain, tapering at the ends\n\tlet crN = abs( vlgPn( X, Y, 6.0, 60.0, 71.0 ) );\n\tlet crMask = smoothstep( 0.1, 0.45, vlgPf( X, Y, 3.0, 4.0, 2, 73.0, 0.5 ) );\n\tlet crack = ( 1.0 - smoothstep( 0.012, 0.055, crN / ( crMask + 0.05 ) ) ) * step( 0.05, crMask );\n\n\tlet kCore = ( 1.0 - smoothstep( kRad * 0.72, kRad, kdm ) ) * kHas;\n\tlet kRing = vlgBand( kdm, kRad * 0.92, kRad * 1.02, kRad * 1.05, kRad * 1.3 ) * kHas;\n\n\tlet height = 0.46 + late * 0.22 * ringDark - erosion * 0.09 + ( streak - 0.5 ) * 0.14\n\t\t- crack * 0.36 + kCore * 0.08 - kRing * 0.22;\n\n\t// silver grey surface, brown-grey eroded grooves, fibre streaks, stains and bleaching\n\tlet blotch = vlgN01( vlgPf( X, Y, 2.0, 3.0, 3, 81.0, 0.5 ) );\n\tlet bleach = smoothstep( 0.5, 0.82, vlgN01( vlgPf( X, Y, 3.0, 2.0, 3, 83.0, 0.5 ) ) );\n\tlet stain = smoothstep( 0.58, 0.86, vlgN01( vlgPf( X, Y, 4.0, 5.0, 3, 85.0, 0.5 ) ) );\n\t// sun-bleached driftwood grey (linear albedo ~0.2 in the grooves, ~0.45 on the latewood)\n\tlet grooveC = vec3f( 0.2, 0.186, 0.168 );\n\tlet silverC = vec3f( 0.45, 0.445, 0.428 );\n\tvar col = mix( grooveC, silverC, clamp( late * ringDark * 0.55 + streak * 0.75 - 0.12, 0.0, 1.0 ) );\n\tcol = col * ( fA * 0.34 + 0.83 );\n\tcol = col * ( 1.0 - smoothstep( 0.7, 0.95, fC ) * 0.3 );\n\tcol = col * ( blotch * 0.24 + 0.88 );\n\tcol = mix( col, vec3f( 0.55, 0.54, 0.51 ), bleach * 0.3 );\n\tcol = mix( col, col * vec3f( 0.8, 0.68, 0.54 ), stain * 0.6 );\n\tcol = mix( col, vec3f( 0.035, 0.03, 0.026 ), crack * 0.92 );\n\tcol = mix( col, mix( vec3f( 0.13, 0.085, 0.05 ), vec3f( 0.07, 0.045, 0.03 ), fract( kdm * 900.0 ) ), kCore );\n\tcol = mix( col, vec3f( 0.05, 0.04, 0.03 ), kRing * 0.8 );\n\n\t// paint chip field (A): paint lets go in grain-aligned flakes, first at cracks, knots and eroded grain\n\tlet flake = vlgPw( X, Y, 30.0, 80.0, 91.0, 0.9 );\n\tlet chipLarge = vlgN01( vlgPf( X, Y, 4.0, 8.0, 4, 97.0, 0.5 ) );\n\tlet chip = chipLarge * 0.62 + flake.z * 0.3 + late * 0.06 - erosion * 0.04\n\t\t- crack * 0.4 - kCore * 0.1;\n\n\tlet rough = clamp( 0.82 + erosion * 0.1 + fA * 0.04 + crack * 0.08 - kCore * 0.15, 0.0, 1.0 );\n\tlet occ = 1.0 - crack * 0.65 - kRing * 0.4 - erosion * 0.08;\n\treturn VlgOut( vec4f( height, rough, occ, 0.0 ), vec4f( col, clamp( chip, 0.0, 1.0 ) ) );\n}\n";
    readonly paint: "\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\tlet strokes = vlgPn( X, Y, 4.0, 60.0, 701.0 ) * 0.25 + vlgPn( X, Y, 16.0, 160.0, 703.0 ) * 0.12 + vlgPn( X, Y, 2.0, 12.0, 704.0 ) * 0.2;\n\tlet cz = vlgPw( X, Y, 34.0, 40.0, 705.0, 1.0 );\n\tlet crazeMask = smoothstep( 0.62, 0.85, vlgN01( vlgPf( X, Y, 3.0, 2.0, 3, 707.0, 0.5 ) ) );\n\tlet craze = ( 1.0 - smoothstep( 0.015, 0.04, cz.y - cz.x ) ) * crazeMask;\n\tlet height = 0.5 + strokes - craze * 0.12;\n\tlet rough = clamp( 0.5 + strokes * 0.35 + craze * 0.15, 0.0, 1.0 );\n\tlet occ = 1.0 - craze * 0.18;\n\treturn VlgOut( vec4f( height, rough, occ, 0.0 ), vec4f( 0.0 ) );\n}\n";
    readonly grime: "\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\tlet streak = smoothstep( 0.55, 0.9, vlgN01( vlgPn( X, Y, 26.0, 2.0, 601.0 ) ) ) * smoothstep( 0.35, 0.7, vlgN01( vlgPf( X, Y, 4.0, 3.0, 2, 603.0, 0.5 ) ) );\n\tlet drip = smoothstep( 0.6, 0.95, vlgN01( vlgPn( X, Y, 70.0, 4.0, 604.0 ) ) ) * 0.5;\n\tlet salt = smoothstep( 0.52, 0.8, vlgN01( vlgPf( X, Y, 4.0, 4.0, 5, 605.0, 0.5 ) ) ) * ( vlgN01( vlgPn( X, Y, 120.0, 120.0, 607.0 ) ) * 0.5 + 0.5 );\n\tlet mw = vlgPw( X, Y, 60.0, 60.0, 609.0, 1.0 );\n\tlet mildew = ( 1.0 - smoothstep( 0.05, 0.22, mw.x ) ) * step( 0.6, vlgN01( vlgPf( X, Y, 3.0, 3.0, 3, 611.0, 0.5 ) ) );\n\tlet macroV = vlgN01( vlgPf( X, Y, 2.0, 2.0, 3, 613.0, 0.5 ) );\n\treturn VlgOut( vec4f( 0.0 ), vec4f( clamp( streak + drip, 0.0, 1.0 ), salt, mildew, macroV ) );\n}\n";
    readonly roof: "\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\tlet corr = sin( ( X * 8.0 - 0.25 ) * VLG_TAU ) * 0.5 + 0.5;\n\tlet valley = 1.0 - corr;\n\t// screws with washers on every second crest at each purlin\n\tlet sx = ( fract( X * 4.0 - 0.25 + 0.5 ) - 0.5 ) * ( 0.84 / 4.0 );\n\tlet sy = ( fract( Y * 3.0 - 0.5 + 0.5 ) - 0.5 ) * ( 1.68 / 3.0 );\n\tlet ds = length( vec2f( sx, sy ) );\n\tlet washer = 1.0 - smoothstep( 0.0095, 0.0115, ds );\n\tlet hq = ds / 0.0065;\n\tlet head = sqrt( max( 1.0 - hq * hq, 0.0 ) );\n\t// dents, rust pitting\n\tlet dw = vlgPw( X, Y, 5.0, 10.0, 13.0, 0.9 );\n\tlet dent = step( 0.7, dw.z ) * ( 1.0 - smoothstep( 0.0, 0.5, dw.x ) );\n\tlet blot = vlgN01( vlgPf( X, Y, 3.0, 5.0, 5, 31.0, 0.5 ) );\n\tlet vstreak = vlgN01( vlgPn( X, Y, 48.0, 3.0, 33.0 ) );\n\tlet sq = sx / 0.007;\n\tlet screwStreak = exp( - ( sq * sq ) ) * smoothstep( - 0.35, - 0.01, sy ) * step( sy, 0.004 )\n\t\t* ( vlgN01( vlgPn( X, Y, 16.0, 6.0, 35.0 ) ) * 0.8 + 0.2 );\n\tlet edge = 1.0 - smoothstep( 0.0, 0.05, min( X, 1.0 - X ) * 0.84 );\n\tlet streakLong = smoothstep( 0.55, 0.85, vlgN01( vlgPn( X, Y, 64.0, 2.0, 39.0 ) ) ) * vlgN01( vlgPf( X, Y, 4.0, 6.0, 2, 45.0, 0.5 ) );\n\tlet rust = clamp( blot * 0.42 + vstreak * valley * 0.25 + streakLong * 0.35 + screwStreak * 0.7 + washer * 0.45 + edge * 0.3 + dent * 0.15 - 0.05, 0.0, 1.0 );\n\tlet pit = vlgPn( X, Y, 150.0, 300.0, 37.0 ) * smoothstep( 0.45, 0.8, rust );\n\tlet lapLine = 1.0 - smoothstep( 0.0012, 0.0028, abs( X * 0.84 - 0.028 ) );\n\tlet lapTop = 1.0 - smoothstep( 0.026, 0.03, X * 0.84 );\n\tlet height = corr * 0.9 + washer * 0.035 + head * 0.05 - dent * 0.1 + pit * 0.012 + lapTop * 0.012;\n\n\tlet rustVar = vlgN01( vlgPf( X, Y, 10.0, 20.0, 3, 41.0, 0.5 ) );\n\tlet fade = clamp( vlgN01( vlgPf( X, Y, 2.0, 4.0, 4, 43.0, 0.5 ) ) * 0.8 + corr * 0.25, 0.0, 1.0 );\n\tlet grime = clamp( valley * vlgN01( vlgPn( X, Y, 32.0, 2.0, 47.0 ) ) * 0.8 + blot * 0.2, 0.0, 1.0 );\n\tlet rough = clamp( 0.5 + ( vlgN01( vlgPn( X, Y, 20.0, 40.0, 49.0 ) ) - 0.5 ) * 0.25 + fade * 0.1, 0.0, 1.0 );\n\tlet occ = 1.0 - lapLine * 0.7 - vlgBand( ds, 0.0095, 0.011, 0.012, 0.016 ) * 0.35;\n\treturn VlgOut( vec4f( height, rough, occ, 0.0 ), vec4f( rust, rustVar, fade, grime ) );\n}\n";
    readonly thatch: `
struct VlgRow { tip: f32, sf: f32, rnd: f32 };

const VLG_R: f32 = 5.0;

fn vlgRow( X: f32, rowF: f32, k: f32 ) -> VlgRow {
\tlet kk = k - floor( k / VLG_R ) * VLG_R;
\tlet warp = vlgPNoise( vec2f( X * 7.0, kk * 3.1 ), vec2f( 7.0, 1000.0 ), 131.0 );
\t// strands lean a little, in coherent groups, so they are not perfectly parallel
\tlet lean = vlgPNoise( vec2f( X * 9.0, kk * 5.3 ), vec2f( 9.0, 1000.0 ), 133.0 );
\tlet s = max( rowF - k, - 0.5 );
\tlet sc = X * 110.0 + warp * 1.3 + lean * s * 2.2;
\tlet sid = floor( sc );
\tlet sidW = sid - floor( sid / 110.0 ) * 110.0;
\tlet sf = fract( sc );
\tlet rnd = vlgHf( sidW + kk * 211.0, kk * 7.3 + 1.0 );
\tlet lump = vlgN01( vlgPNoise( vec2f( X * 5.0, kk * 2.3 ), vec2f( 5.0, 1000.0 ), 137.0 ) );
\tlet lump2 = vlgN01( vlgPNoise( vec2f( X * 2.0, kk * 1.7 ), vec2f( 2.0, 1000.0 ), 139.0 ) );
\tlet hang = 0.06 + lump * 0.14 + lump2 * 0.16 + rnd * rnd * 0.22;
\treturn VlgRow( k - hang, sf, rnd );
}

fn vlgGen( X: f32, Y: f32 ) -> VlgOut {
\t// rows wave up and down along the eave and are unevenly spaced
\tlet rowWarp = vlgPn( X, Y, 3.0, 1.0, 143.0 ) * 0.22 + vlgPn( X, Y, 7.0, 2.0, 145.0 ) * 0.1;
\tlet rowF = Y * VLG_R + rowWarp;
\tlet k0 = floor( rowF );

\tlet r0 = vlgRow( X, rowF, k0 );
\tlet r1 = vlgRow( X, rowF, k0 + 1.0 );
\tlet r2 = vlgRow( X, rowF, k0 + 2.0 );
\tlet in1 = step( r1.tip, rowF );
\tlet tip = mix( r0.tip, r1.tip, in1 );
\tlet nextTip = mix( r1.tip, r2.tip, in1 );
\tlet sf = mix( r0.sf, r1.sf, in1 );
\tlet rnd = mix( r0.rnd, r1.rnd, in1 );
\tlet s = rowF - tip;
\tlet dNext = nextTip - rowF;

\tlet bulge = sin( sf * ${number} );
\tlet tipZone = 1.0 - smoothstep( 0.0, 0.16, s );
\t// frayed tips and gaps between strands reveal the darker layer underneath
\tlet gapW = mix( 0.43, 0.3, tipZone ) - vlgHf( rnd, 2.2 ) * 0.06;
\tlet gap = smoothstep( gapW, gapW + 0.05, abs( sf - 0.5 ) );
\tlet fibre = vlgPn( X, Y, 330.0, 6.0, 139.0 );
\tlet fibre2 = vlgPn( X, Y, 160.0, 3.0, 141.0 );
\tlet height = 0.92 - min( s, 1.3 ) / 1.3 * 0.55 + bulge * 0.08 + fibre * 0.03 - gap * 0.32;

\tlet golden = vec3f( 0.42, 0.3, 0.13 );
\tlet pale = vec3f( 0.5, 0.43, 0.27 );
\tlet brown = vec3f( 0.24, 0.165, 0.09 );
\tlet grey = vec3f( 0.34, 0.31, 0.26 );
\tvar col = mix( golden, pale, smoothstep( 0.25, 0.75, rnd ) );
\tcol = mix( col, brown, step( 0.85, rnd ) * 0.75 );
\tcol = mix( col, grey, smoothstep( 0.1, 0.5, vlgHf( rnd, 9.1 ) ) * 0.4 );
\tcol = col * ( vlgN01( fibre ) * 0.38 + 0.8 ) * ( vlgN01( fibre2 ) * 0.2 + 0.9 );
\tcol = mix( col, grey * 1.18, tipZone * 0.4 );
\tcol = col * ( 1.0 - smoothstep( 0.55, 1.25, s ) * 0.3 );
\tcol = mix( col, vec3f( 0.07, 0.055, 0.035 ), gap * 0.85 );
\tlet occ = ( smoothstep( 0.0, 0.32, dNext ) * 0.7 + 0.3 ) * ( bulge * 0.25 + 0.75 ) * ( 1.0 - gap * 0.6 );
\tlet rough = 0.88 + fibre * 0.05;
\treturn VlgOut( vec4f( height, rough, occ, 0.0 ), vec4f( col, tipZone ) );
}
`;
    readonly stone: "\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\tlet wx = vlgPf( X, Y, 4.0, 4.0, 2, 213.0, 0.5 ) * 0.45;\n\tlet wy = vlgPf( X, Y, 4.0, 4.0, 2, 215.0, 0.5 ) * 0.45;\n\tlet W = vlgPWorley( vec2f( X * 7.0 + wx, Y * 12.0 + wy ), vec2f( 7.0, 12.0 ), 201.0, 0.85 );\n\tlet edge = W.y - W.x;\n\tlet mortar = 1.0 - smoothstep( 0.035, 0.085, edge );\n\tlet dome = pow( smoothstep( 0.02, 0.5, edge ), 0.7 );\n\tlet surf = vlgPf( X, Y, 24.0, 24.0, 4, 203.0, 0.5 );\n\tlet pits = vlgPw( X, Y, 70.0, 70.0, 207.0, 1.0 );\n\tlet porous = step( 0.55, vlgHf( W.z, 4.2 ) );\n\tlet pitSize = mix( 0.1, 0.19, vlgHf( pits.z, 1.7 ) );\n\tlet pit = ( 1.0 - smoothstep( pitSize * 0.6, pitSize, pits.x ) ) * step( 0.4, pits.z ) * ( porous * 0.75 + 0.25 );\n\tlet sandy = vlgPn( X, Y, 140.0, 140.0, 209.0 );\n\tlet height = 0.2 + dome * 0.46 + surf * 0.11 + vlgPn( X, Y, 200.0, 200.0, 229.0 ) * 0.025 - pit * 0.16 - mortar * 0.12 + sandy * 0.02;\n\n\tlet id = W.z;\n\t// coral stone / limestone: warm beiges with the odd darker basalt and pale block\n\tlet c0 = vec3f( 0.55, 0.5, 0.41 );\n\tlet c1 = vec3f( 0.47, 0.45, 0.41 );\n\tlet c2 = vec3f( 0.42, 0.37, 0.3 );\n\tlet c3 = vec3f( 0.3, 0.29, 0.27 );\n\tlet c4 = vec3f( 0.64, 0.6, 0.52 );\n\tvar col = mix( c0, c1, smoothstep( 0.2, 0.4, id ) );\n\tcol = mix( col, c2, smoothstep( 0.5, 0.62, id ) );\n\tcol = mix( col, c3, smoothstep( 0.8, 0.86, id ) * 0.8 );\n\tcol = mix( col, c4, smoothstep( 0.9, 0.97, id ) );\n\t// mottling, veins and weathering inside each stone\n\tlet mott = vlgN01( vlgPf( X, Y, 10.0, 10.0, 4, 217.0, 0.5 ) );\n\tlet vein = ( 1.0 - smoothstep( 0.0, 0.035, abs( vlgPf( X, Y, 6.0, 6.0, 3, 219.0, 0.5 ) ) ) ) * step( 0.6, vlgHf( id, 6.6 ) );\n\tlet speck = vlgN01( vlgPn( X, Y, 300.0, 300.0, 225.0 ) );\n\tlet grain = vlgN01( vlgPn( X, Y, 120.0, 120.0, 227.0 ) );\n\tcol = col * ( mott * 0.6 + 0.68 ) * ( vlgN01( surf ) * 0.3 + 0.85 ) * ( speck * 0.34 + 0.83 ) * ( grain * 0.22 + 0.89 );\n\tcol = col * mix( 0.66, 1.0, smoothstep( 0.04, 0.28, edge ) );\n\tcol = mix( col, col * 1.25, vein * 0.5 );\n\t// lichen: pale grey-green and dark specks\n\tlet lich = smoothstep( 0.62, 0.8, vlgN01( vlgPf( X, Y, 8.0, 8.0, 3, 221.0, 0.5 ) ) ) * smoothstep( 0.4, 0.6, vlgN01( vlgPn( X, Y, 60.0, 60.0, 223.0 ) ) );\n\tcol = mix( col, vec3f( 0.42, 0.44, 0.36 ), lich * 0.45 );\n\tcol = col * ( 1.0 - pit * 0.5 );\n\tcol = mix( col, vec3f( 0.5, 0.47, 0.41 ) * ( vlgN01( sandy ) * 0.3 + 0.85 ), mortar );\n\tcol = col * ( 1.0 - vlgBand( edge, 0.03, 0.06, 0.08, 0.16 ) * 0.3 );\n\tlet plaster = clamp( vlgN01( vlgPf( X, Y, 3.0, 3.0, 5, 211.0, 0.5 ) ) - mortar * 0.08, 0.0, 1.0 );\n\tlet rough = 0.84 + surf * 0.06 + mortar * 0.1 - lich * 0.05;\n\tlet occ = 1.0 - pit * 0.55 - mortar * 0.3;\n\treturn VlgOut( vec4f( height, rough, occ, 0.0 ), vec4f( col, plaster ) );\n}\n";
    readonly hard: "\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\tlet base = vlgN01( vlgPf( X, Y, 4.0, 4.0, 5, 401.0, 0.5 ) );\n\tlet sp = vlgPw( X, Y, 16.0, 16.0, 403.0, 1.0 );\n\tlet spots = ( 1.0 - smoothstep( 0.1, 0.38, sp.x ) ) * step( 0.5, sp.z );\n\tlet rust = clamp( base * 0.8 + spots * 0.35 - 0.08, 0.0, 1.0 );\n\tlet sMask = smoothstep( 0.2, 0.6, vlgN01( vlgPf( X, Y, 3.0, 3.0, 2, 413.0, 0.5 ) ) );\n\tlet s1 = 1.0 - smoothstep( 0.008, 0.03, abs( vlgPn( X, Y, 3.0, 90.0, 405.0 ) ) );\n\tlet s2 = 1.0 - smoothstep( 0.008, 0.03, abs( vlgPn( X, Y, 90.0, 3.0, 407.0 ) ) );\n\tlet scratch = max( s1, s2 ) * sMask;\n\tlet grime = vlgN01( vlgPf( X, Y, 3.0, 3.0, 3, 409.0, 0.5 ) );\n\tlet pw2 = vlgPw( X, Y, 90.0, 90.0, 411.0, 1.0 );\n\tlet pit = ( 1.0 - smoothstep( 0.1, 0.28, pw2.x ) ) * smoothstep( 0.4, 0.8, rust );\n\tlet bump = vlgPn( X, Y, 40.0, 40.0, 415.0 ) * 0.04 * rust;\n\tlet height = 0.5 - pit * 0.3 - scratch * 0.12 + bump;\n\tlet rough = clamp( 0.5 + rust * 0.3 - scratch * 0.25 + grime * 0.08, 0.0, 1.0 );\n\tlet occ = 1.0 - pit * 0.5;\n\treturn VlgOut( vec4f( height, rough, occ, 0.0 ), vec4f( rust, scratch, grime, 0.0 ) );\n}\n";
    readonly rope: "\nfn vlgRopeH( q: vec2f ) -> f32 {\n\tlet phi = ( q.x + q.y ) * 3.0;\n\tlet sf = fract( phi );\n\tlet a = sf * 2.0 - 1.0;\n\tlet prof = sqrt( max( 1.0 - a * a, 0.0 ) );\n\tlet yarn = fract( sf * 3.0 + ( q.x - q.y ) * 6.0 );\n\tlet b = yarn * 2.0 - 1.0;\n\tlet yprof = sqrt( max( 1.0 - b * b, 0.0 ) );\n\tlet fuzz = vlgPNoise( q * 64.0, vec2f( 64.0 ), 801.0 );\n\treturn prof * 0.8 + yprof * prof * 0.2 + fuzz * 0.03;\n}\n\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\tlet q = vec2f( X, Y );\n\tlet e = 1.0 / 256.0;\n\tlet hx = vlgRopeH( q + vec2f( e, 0.0 ) ) - vlgRopeH( q - vec2f( e, 0.0 ) );\n\tlet hy = vlgRopeH( q + vec2f( 0.0, e ) ) - vlgRopeH( q - vec2f( 0.0, e ) );\n\tlet n = normalize( vec3f( hx * ( - 0.09 / ( 2.0 * e ) ), hy * ( - 0.09 / ( 2.0 * e ) ), 1.0 ) );\n\tlet h = vlgRopeH( q );\n\tlet fib = vlgN01( vlgPNoise( vec2f( ( X + Y ) * 40.0, ( X - Y ) * 160.0 ), vec2f( 40.0, 160.0 ), 803.0 ) );\n\tlet lum = 0.45 + h * 0.4 + fib * 0.15;\n\tlet ao = 0.3 + smoothstep( 0.0, 0.7, h ) * 0.7;\n\treturn VlgOut( vec4f( 0.0 ), vec4f( lum, ao, n.x * 0.5 + 0.5, n.y * 0.5 + 0.5 ) );\n}\n";
    readonly net: "\nfn vlgNetH( q: vec2f ) -> f32 {\n\tlet a = ( q.x + q.y ) * 4.0;\n\tlet b = ( q.x - q.y ) * 4.0;\n\tlet da = 0.5 - abs( fract( a ) - 0.5 );\n\tlet db = 0.5 - abs( fract( b ) - 0.5 );\n\tlet w = 0.055;\n\tlet qa = da / w;\n\tlet qb = db / w;\n\tlet la = sqrt( max( 1.0 - qa * qa, 0.0 ) ) * ( abs( fract( b * 14.0 ) - 0.5 ) * 0.25 + 0.8 );\n\tlet lb = sqrt( max( 1.0 - qb * qb, 0.0 ) ) * ( abs( fract( a * 14.0 ) - 0.5 ) * 0.25 + 0.8 );\n\tlet qk = length( vec2f( da, db ) ) / 0.1;\n\tlet knot = sqrt( max( 1.0 - qk * qk, 0.0 ) ) * 1.35;\n\treturn max( max( la, lb ), knot );\n}\n\nfn vlgGen( X: f32, Y: f32 ) -> VlgOut {\n\tlet q = vec2f( X, Y );\n\tlet e = 1.0 / 256.0;\n\tlet h = vlgNetH( q );\n\tlet hx = vlgNetH( q + vec2f( e, 0.0 ) ) - vlgNetH( q - vec2f( e, 0.0 ) );\n\tlet hy = vlgNetH( q + vec2f( 0.0, e ) ) - vlgNetH( q - vec2f( 0.0, e ) );\n\tlet n = normalize( vec3f( hx * ( - 0.012 / ( 2.0 * e ) ), hy * ( - 0.012 / ( 2.0 * e ) ), 1.0 ) );\n\tlet alpha = smoothstep( 0.0, 0.18, h );\n\tlet shade = 0.45 + min( h, 1.0 ) * 0.55;\n\treturn VlgOut( vec4f( 0.0 ), vec4f( alpha, shade, n.x * 0.5 + 0.5, n.y * 0.5 + 0.5 ) );\n}\n";
};
export type VillageSetName = keyof typeof GENERATORS;
/** One baked set: size in texels, tile size (m), height scale, AO strength and output map names. */
export interface VillageTextureSet {
    name: VillageSetName;
    w: number;
    h: number;
    mx?: number;
    my?: number;
    hs?: number;
    ao?: number;
    out: VillageTextureName | null;
    nra: VillageTextureName | null;
}
export declare function deriveCode(set: VillageTextureSet): string;
export declare const SETS: readonly VillageTextureSet[];
/** Workgroup size of every bake kernel (source workgroupSize [ 8, 8, 1 ]; WG_X / WG_Y in the code). */
export declare const BAKE_WORKGROUP: readonly [8, 8, 1];
/** Main entry of a "fields" kernel (appended to the set's generator). */
export declare function fieldsKernelMain(set: VillageTextureSet, hasFields: boolean, hasAlbedo: boolean): string;
/** A compute pass of the bake, in source order (label as the source ComputeKernel label). */
export interface VillageBakeKernel {
    label: string;
    set: VillageSetName;
    kind: 'fields' | 'derive';
    /** WGSL module names the code needs before it (the noise library for the fields kernels). */
    modules: string[];
    code: string;
    /** storage / sampled texture bindings: name -> target map ('fields' = the transient RGBA16F map) */
    bindings: Record<string, string>;
    width: number;
    height: number;
}
/** Source VillageTextures.bake 641-703: the kernels per set, fields then derive; mipmaps follow each map. */
export declare function villageBakePlan(): VillageBakeKernel[];
/** Approximate GPU memory of the final mipmapped maps (source VillageTextures.bytes). */
export declare function villageTextureBytes(): number;

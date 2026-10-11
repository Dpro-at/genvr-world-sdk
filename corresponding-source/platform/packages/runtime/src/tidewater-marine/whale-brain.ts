/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/marine/WhaleBrain.js 1-517 (route, surfacing sequence, breach, flippers).
//
// Divergence: the route is the `route` option; its default is the source's ROUTE (Tidewater's bay,
// line 13), kept so the port runs the source's loop. A place passes its own route (decision 130:
// the layout belongs to the build client).
import { CatmullRomCurve3, Euler, MathUtils, Quaternion, Vector3 } from 'three';

// Behaviour of the humpback: a loop through the deep water of the bay mouth and past the reef
// drop-off (~4.5 min), a surfacing sequence of 3-6 breaths (rise, blow, roll back under) in
// view of the beach and the pier, and a fluke-up dive back to depth.
//
// Outputs for the rig (Whale._pose): root pose (position, quaternion), path orientation history
// (the body follows the route), stroke phase / amplitude, arch, head pitch, flipper rotations,
// and events: blow intensity (0..1) and fluke-lift (drips).

// route (x, z) through the bay, checked against TerrainData
// passes ~130 m off the beach and ~65 m from the pier head; >= 8.8 m of water everywhere
export const WHALE_SOURCE_ROUTE:readonly ( readonly [ number, number ] )[] = [ [ 70, 300 ], [ 60, 200 ], [ 35, 120 ], [ 5, 88 ], [ - 25, 100 ], [ - 52, 128 ], [ - 75, 178 ], [ - 52, 262 ], [ - 10, 330 ] ];
const SURFACE_AT = 0.25; // route fraction where the surfacing sequence starts (heading in toward the beach)
const CRUISE_SPEED = 2.6; // m/s underwater
const SURFACE_SPEED = 1.5;
const TAU = Math.PI * 2;

const _e = new Euler();
const _q = new Quaternion();
const _p = new Vector3();

/** One key of the surfacing sequence (or the cruise target). */
export interface WhaleKey {
	t?:number; depth:number; pitch:number; arch:number; follow:number; speed:number; stroke:number;
	blow?:boolean; fluke?:boolean; breach?:'launch' | 'air';
}

/** GPU water height read-back (the source's water query). */
export interface WaterQuery {
	allocate( name:string, n:number ):number;
	setPoint( slot:number, x:number, z:number ):void;
	cpuValid:boolean;
	get( slot:number ):{ height:number };
}

export interface WhaleFin { sweep:number; lift:number; twist:number; vs:number; vl:number; vt:number }

export class WhaleBrain {

	terrain:{ heightAt( x:number, z:number ):number } | null;
	query:WaterQuery | null;
	rand:() => number;
	route:readonly ( readonly number[] )[];
	length!:number;
	rN!:number;
	rPos!:Float64Array;
	rYaw!:Float64Array;
	yawWrap!:number;
	curve!:CatmullRomCurve3;
	u:number;
	position = new Vector3();
	quaternion = new Quaternion();
	velocity = new Vector3();
	speed = CRUISE_SPEED;
	yaw = 0;
	pitch = 0;
	roll = 0;
	rollV = 0;
	breachRoll = 0; // twist in the air during a breach
	breaches = 0; // counters of breach events (read by the water marks)
	splashes = 0;
	bob = 0;
	y = - 9;
	vy = 0;
	water = 0;
	wetAge = 100; // s since the back last broke the surface
	strokePhase = 0;
	strokeAmp = 0.13;
	arch = 0;
	headPitch = 0;
	follow = 0.85;
	blow = 0;
	flukeUp = 0;
	flip = [ 0, 0 ];
	flipV = [ 0, 0 ];
	fin:WhaleFin[];
	slap:{ side:number; t:number; hit?:boolean } | null = null;
	slapTimer = 12;
	slaps = 0;
	yawRate = 0;
	time = 0;
	HN = 2048;
	hArc:Float64Array;
	hQ:Float32Array;
	hHead = - 1;
	hCount = 0;
	arc = 0;
	seq:{ keys:WhaleKey[]; i:number; t:number; blown:boolean; splashed?:boolean } | null = null;
	state:'cruise' | 'surface' = 'cruise';
	lastWrap = false;
	slot?:number;
	forceBreach?:boolean;
	onBlow?:() => void;

	constructor( { terrain = null, query = null, seed = 1, route = WHALE_SOURCE_ROUTE }:{
		terrain?:{ heightAt( x:number, z:number ):number } | null; query?:WaterQuery | null; seed?:number; route?:readonly ( readonly number[] )[];
	} ) {

		this.terrain = terrain;
		this.query = query;
		this.rand = mulberry( seed );
		this.route = route;
		this._buildRoute();
		this.u = this.length * ( SURFACE_AT - 0.06 ); // start just before the surfacing zone
		// pectoral flippers (a third of the body length): sweep (fore / aft), lift (up / down) and
		// twist (about the long axis), each a heavy damped spring toward its target
		this.fin = [ 0, 1 ].map( () => ( { sweep: 0, lift: 0, twist: 0, vs: 0, vl: 0, vt: 0 } ) );
		// path history: root orientation stamped with the travelled distance (ring buffer, one
		// entry per update). The tail samples it at (arc - d) with interpolation, so the body
		// follows the route continuously at any frame rate.
		this.hArc = new Float64Array( this.HN );
		this.hQ = new Float32Array( this.HN * 4 );
		if ( query ) this.slot = query.allocate( 'whale', 1 );
		this._place( 0 );
		// seed the history with a straight run-in
		for ( let i = 60; i >= 0; i -- ) this._record( - i * 0.4 );

	}

	_buildRoute() {

		const pts = this.route.map( ( p ) => new Vector3( p[ 0 ], 0, p[ 1 ] ) );
		const curve = new CatmullRomCurve3( pts, true, 'centripetal', 0.5 );
		curve.arcLengthDivisions = 4000;
		this.length = curve.getLength();
		// dense arc-length table: position and heading, sampled every 0.25 m (smooth C1 route)
		const n = Math.ceil( this.length / 0.25 );
		this.rN = n;
		this.rPos = new Float64Array( ( n + 1 ) * 2 );
		this.rYaw = new Float64Array( n + 1 );
		const p = new Vector3(), tg = new Vector3();
		let prevYaw = 0;
		for ( let i = 0; i <= n; i ++ ) {

			const u = i / n;
			curve.getPointAt( u, p );
			curve.getTangentAt( u, tg );
			this.rPos[ i * 2 ] = p.x;
			this.rPos[ i * 2 + 1 ] = p.z;
			let yaw = Math.atan2( tg.x, tg.z );
			if ( i > 0 ) yaw = prevYaw + Math.atan2( Math.sin( yaw - prevYaw ), Math.cos( yaw - prevYaw ) ); // unwrapped
			this.rYaw[ i ] = prevYaw = yaw;

		}

		this.yawWrap = this.rYaw[ n ]! - this.rYaw[ 0 ]!; // one loop turns by 2 pi
		this.curve = curve;

	}

	_routeIndex( u:number ) {

		const L = this.length;
		const loops = Math.floor( u / L );
		const f = ( u - loops * L ) / L * this.rN;
		const i = Math.min( Math.floor( f ), this.rN - 1 );
		return { i, t: f - i, loops };

	}

	routeAt( u:number, out:Vector3 ) {

		const { i, t } = this._routeIndex( u );
		const P = this.rPos;
		return out.set( P[ i * 2 ]! + ( P[ i * 2 + 2 ]! - P[ i * 2 ]! ) * t, 0, P[ i * 2 + 1 ]! + ( P[ i * 2 + 3 ]! - P[ i * 2 + 1 ]! ) * t );

	}

	// heading (unwrapped, continuous over loops) at route distance u, smoothed over +-2 m
	routeYaw( u:number ) {

		let s = 0;
		for ( const o of [ - 2, - 1, 0, 1, 2 ] ) {

			const { i, t, loops } = this._routeIndex( u + o );
			s += this.rYaw[ i ]! + ( this.rYaw[ i + 1 ]! - this.rYaw[ i ]! ) * t + loops * this.yawWrap;

		}

		return s / 5;

	}

	_record( arc:number ) {

		const h = this.hHead = ( this.hHead + 1 ) % this.HN;
		this.hArc[ h ] = arc;
		const q = this.quaternion;
		this.hQ[ h * 4 ] = q.x; this.hQ[ h * 4 + 1 ] = q.y; this.hQ[ h * 4 + 2 ] = q.z; this.hQ[ h * 4 + 3 ] = q.w;
		this.hCount = Math.min( this.hCount + 1, this.HN );

	}

	// orientation the root had when it was `d` metres of travel behind its current position
	pathRotation( d:number, out:Quaternion ) {

		const target = this.arc - d;
		const N = this.HN, H = this.hHead;
		// newest -> oldest, entries are monotonic in arc
		let lo = 0, hi = this.hCount - 1; // lo: newest index offset, hi: oldest
		const arcAt = ( k:number ) => this.hArc[ ( H - k + N ) % N ]!;
		if ( target >= arcAt( 0 ) ) return this._q( H, out );
		if ( target <= arcAt( hi ) ) return this._q( ( H - hi + N ) % N, out );
		while ( hi - lo > 1 ) {

			const m = ( lo + hi ) >> 1;
			if ( arcAt( m ) > target ) lo = m; else hi = m;

		}

		const a0 = arcAt( lo ), a1 = arcAt( hi );
		const t = ( a0 - target ) / Math.max( a0 - a1, 1e-9 );
		this._q( ( H - lo + N ) % N, out );
		return out.slerp( this._q( ( H - hi + N ) % N, _q ), t );

	}

	_q( idx:number, out:Quaternion ) {

		const Q = this.hQ;
		return out.set( Q[ idx * 4 ]!, Q[ idx * 4 + 1 ]!, Q[ idx * 4 + 2 ]!, Q[ idx * 4 + 3 ]! );

	}

	flipperRotation( side:number, out:Quaternion ) {

		// side 0 = left (+x), 1 = right; flippers hang lower and sweep with the stroke
		const sg = side === 0 ? 1 : - 1;
		const f = this.fin[ side ]!;
		_e.set( f.twist, sg * ( 0.12 + f.sweep ), sg * ( - 0.28 + f.lift ), 'YZX' );
		return out.setFromEuler( _e );

	}

	// Flippers: slow rowing strokes while cruising (sweep forward feathered, pull back flat), banked
	// into turns (the inside flipper dips, the outer one rises and reaches forward), angled with the
	// dives and the rise to the surface, spread wide in a breach, and now and then at the surface a
	// big lift of one flipper clear of the water and a slap back down.
	_flippers( dt:number, target:WhaleKey ) {

		const surface = this.state === 'surface' && this.water - this.y < 2.5;
		// turning: bank from the yaw rate (smoothed)
		const turn = Math.max( - 1, Math.min( 1, this.yawRate * 25 ) );
		const row = this.time * TAU / 11; // one heavy stroke every ~11 s
		const air = target.breach === 'air';
		// the slap: chosen now and then while the back is at the surface
		if ( surface && this.water - this.y < 1.35 && ! this.slap && ! air ) {

			this.slapTimer -= dt;
			if ( this.slapTimer < 0 ) {

				this.slap = { side: this.rand() < 0.5 ? 0 : 1, t: 0 };
				this.slapTimer = 18 + this.rand() * 25;

			}

		}

		for ( let s = 0; s < 2; s ++ ) {

			const f = this.fin[ s ]!, sg = s === 0 ? 1 : - 1;
			const ph = row + s * 0.35;
			let sweep = 0.18 * Math.sin( ph ) + 0.1 + ( surface ? 0.12 : 0 );
			let lift = 0.1 * Math.sin( ph + 0.8 ) - sg * turn * 0.45 + ( surface ? 0.08 : 0 );
			let twist = 0.3 * Math.cos( ph ) + this.pitch * 0.6;
			sweep += Math.max( 0, sg * turn ) * 0.25; // the outer flipper reaches forward
			let stiff = 0.45;
			if ( air ) {

				sweep = 0.45;
				lift = 0.7;
				twist = 0.3;
				stiff = 2.5;

			} else if ( this.slap && this.slap.side === s ) {

				// raise the flipper high over ~3 s, hold, then bring it down hard
				const t = this.slap.t;
				if ( t < 3.5 ) {

					lift = 1.55;
					sweep = 0.35;
					twist = - 0.2;
					stiff = 0.9;

				} else {

					lift = - 0.45;
					twist = 0.35;
					stiff = 9;
					if ( t > 3.8 && ! this.slap.hit ) {

						this.slap.hit = true;
						this.slaps ++;

					}

				}

			}

			const k = stiff, c = 2 * Math.sqrt( stiff ) * 0.9;
			f.vs += ( ( sweep - f.sweep ) * k - f.vs * c ) * dt;
			f.vl += ( ( lift - f.lift ) * k - f.vl * c ) * dt;
			f.vt += ( ( twist - f.twist ) * k - f.vt * c ) * dt;
			f.sweep += f.vs * dt;
			f.lift += f.vl * dt;
			f.twist += f.vt * dt;

		}

		if ( this.slap ) {

			this.slap.t += dt;
			if ( this.slap.t > 6 ) this.slap = null;

		}

	}

	floorAt( x:number, z:number ) {

		return this.terrain ? this.terrain.heightAt( x, z ) : - 50;

	}

	_place( dt:number ) {

		const p = this.routeAt( this.u, _p );
		const yaw0 = this.yaw;
		this.yaw = this.routeYaw( this.u );
		if ( dt > 0 ) this.yawRate += ( Math.atan2( Math.sin( this.yaw - yaw0 ), Math.cos( this.yaw - yaw0 ) ) / dt - this.yawRate ) * Math.min( 1, dt * 1.2 );
		// bank into turns: curvature (rad / m) x speed = yaw rate; eased, gentle
		const curv = ( this.routeYaw( this.u + 3 ) - this.routeYaw( this.u - 3 ) ) / 6;
		const rollT = MathUtils.clamp( - curv * this.speed * 1.6, - 0.22, 0.22 );
		this.rollV += ( ( rollT - this.roll ) * 0.6 - this.rollV * 1.4 ) * dt;
		this.roll += this.rollV * dt;
		this.position.set( p.x, this.y, p.z );
		// the whole body pitches gently against the tail beat (heavy, slow)
		_e.set( - ( this.pitch + this.bob ), this.yaw, this.roll + this.breachRoll, 'YXZ' );
		this.quaternion.setFromEuler( _e );

	}

	// Surfacing sequence: keyframes of (duration, target depth of the root below the water,
	// pitch offset, arch, follow, speed, blow)
	_startSequence() {

		const n = 3 + Math.floor( this.rand() * 4 ); // 3-6 breaths
		const k:WhaleKey[] = [];
		k.push( { t: 9, depth: 1.3, pitch: 0.08, arch: 0, follow: 0.85, speed: SURFACE_SPEED, stroke: 0.07 } ); // rise
		for ( let i = 0; i < n; i ++ ) {

			k.push( { t: 3.5, depth: 1.12, pitch: 0.1, arch: 0.02, follow: 0.85, speed: SURFACE_SPEED, stroke: 0.03, blow: true } );
			if ( i < n - 1 ) {

				// roll back under: the head goes down, the back and dorsal fin roll through
				k.push( { t: 4, depth: 2.2, pitch: - 0.14, arch: - 0.05, follow: 0.92, speed: SURFACE_SPEED, stroke: 0.04 } );
				k.push( { t: 7 + this.rand() * 6, depth: 3.4, pitch: 0, arch: 0, follow: 0.85, speed: SURFACE_SPEED, stroke: 0.06 } );
				k.push( { t: 5, depth: 1.3, pitch: 0.08, arch: 0, follow: 0.85, speed: SURFACE_SPEED, stroke: 0.06 } );

			}

		}

		// now and then (about every other surfacing, i.e. every few minutes) a breach: sound, then
		// drive up and launch two thirds of the body out of the water, twist, fall back on the side
		if ( this.rand() < ( this.forceBreach ? 1 : 0.5 ) ) {

			k.push( { t: 7, depth: 9, pitch: - 0.2, arch: 0, follow: 0.6, speed: 2.4, stroke: 0.1 } );
			k.push( { t: 6, depth: 9, pitch: 0.45, arch: 0, follow: 0.3, speed: 3.5, stroke: 0.14, breach: 'launch' } );
			k.push( { t: 6, depth: 2, pitch: 0, arch: 0, follow: 0.3, speed: 2.5, stroke: 0.05, breach: 'air' } );
			k.push( { t: 6, depth: 2.4, pitch: 0.05, arch: 0, follow: 0.85, speed: SURFACE_SPEED, stroke: 0.05 } );

		}

		// terminal dive: arch the back high, pitch down steeply, the flukes lift clear and slip under
		k.push( { t: 3, depth: 1.25, pitch: - 0.12, arch: - 0.14, follow: 0.85, speed: 1.8, stroke: 0.02 } );
		k.push( { t: 4.5, depth: 5.5, pitch: - 0.95, arch: - 0.12, follow: 0.12, speed: 1.9, stroke: 0.0, fluke: true } );
		k.push( { t: 6, depth: 11, pitch: - 0.45, arch: 0, follow: 0.6, speed: 2.2, stroke: 0.08 } );
		k.push( { t: 8, depth: 10, pitch: 0, arch: 0, follow: 0.85, speed: CRUISE_SPEED, stroke: 0.1 } );
		this.seq = { keys: k, i: 0, t: 0, blown: false };
		this.state = 'surface';

	}

	// jump to the next key of the sequence (the breach launch ends when the whale breaks through)
	_nextKey( expect:string ) {

		const s = this.seq;
		if ( ! s || s.keys[ s.i + 1 ]?.breach !== expect ) return;
		s.i ++;
		s.t = 0;
		this.breaches ++;

	}

	update( dt:number ) {

		dt = Math.min( dt, 0.1 );
		this.time += dt;
		// water level at the head (read back from the GPU water query, 1-3 frames old)
		const q = this.query;
		if ( q ) {

			const hx = this.position.x + Math.sin( this.yaw ) * 3, hz = this.position.z + Math.cos( this.yaw ) * 3;
			q.setPoint( this.slot!, hx, hz );
			if ( q.cpuValid ) {

				const h = q.get( this.slot! ).height;
				if ( Number.isFinite( h ) ) this.water += ( h - this.water ) * Math.min( 1, dt * 4 );

			}

		}

		// wet film: fresh while the back is out of the water, drying after a few seconds
		this.wetAge = this.backDepth < 0.05 ? this.wetAge + dt : 0;

		// ---- sequencer
		const frac = ( ( this.u / this.length ) % 1 + 1 ) % 1;
		if ( this.state === 'cruise' && frac > SURFACE_AT && frac < SURFACE_AT + 0.05 && ! this.lastWrap ) {

			this._startSequence();
			this.lastWrap = true;

		}

		if ( frac < SURFACE_AT - 0.1 || frac > SURFACE_AT + 0.3 ) this.lastWrap = false;
		let target:WhaleKey = { depth: 9.5, pitch: 0, arch: 0, follow: 0.85, speed: CRUISE_SPEED, stroke: 0.13 };
		this.blow = 0;
		this.flukeUp = 0;
		if ( this.seq ) {

			const s = this.seq;
			const key = s.keys[ s.i ]!;
			s.t += dt;
			target = key;
			if ( key.blow ) {

				// exhale when the blowholes clear the water (about 0.6 s into the hold), ~1.4 s
				const tb = s.t - 0.6;
				this.blow = tb > 0 && tb < 1.4 ? Math.sin( Math.PI * Math.min( tb / 1.4, 1 ) ) ** 0.5 : 0;
				if ( tb > 0 && ! s.blown ) {

					s.blown = true;
					if ( this.onBlow ) this.onBlow();

				}

			}

			if ( key.fluke ) this.flukeUp = Math.min( 1, s.t / key.t! );
			if ( s.t >= key.t! ) {

				s.i ++;
				s.t = 0;
				s.blown = false;
				if ( s.i >= s.keys.length ) {

					this.seq = null;
					this.state = 'cruise';

				}

			}

		}

		// ---- depth: critically damped toward the target, never near the seafloor
		const x = this.position.x, z = this.position.z;
		const sy = Math.sin( this.yaw ), cy = Math.cos( this.yaw );
		let floor = - 1e9;
		// look ahead along the heading so the whale rises before the seabed does
		for ( const d of [ - 9, - 5, 0, 5, 10, 16, 24 ] ) floor = Math.max( floor, this.floorAt( x + sy * d, z + cy * d ) );
		const yT = Math.max( this.water - target.depth, floor + 5.2 );
		const w = target.fluke ? 1.0 : 0.7;
		let ay = ( yT - this.y ) * w * w - 2 * w * this.vy;
		if ( target.breach === 'launch' ) {

			// drive for the surface; out of the water at ~9 m/s
			ay = 14;
			if ( this.y > this.water - 2.5 ) this._nextKey( 'air' );

		} else if ( target.breach === 'air' ) {

			// ballistic above the water (buoyancy and drag take over below), twisting onto the side
			ay = this.vy > 0 || this.y > this.water - 1 ? - 9.81 : ( yT - this.y ) * 0.5 - 1.5 * this.vy;
			this.breachRoll += ( 1.9 - this.breachRoll ) * Math.min( 1, dt * 1.2 );
			if ( this.vy < 0 && this.y < this.water - 1.5 && ! this.seq!.splashed ) {

				this.seq!.splashed = true;
				this.splashes ++;

			}

		}

		if ( target.breach !== 'air' ) this.breachRoll += ( 0 - this.breachRoll ) * Math.min( 1, dt * 0.6 );
		this.vy += ay * dt;
		this.y += this.vy * dt;
		// hard floor: never closer than ~3.3 m (belly ~1.9 m) above the seabed under the body
		const hard = floor + 4.6;
		if ( this.y < hard ) {

			this.y = hard;
			this.vy = Math.max( this.vy, 0 );

		}
		const k = Math.min( 1, dt * 1.2 );
		this.speed += ( target.speed - this.speed ) * Math.min( 1, dt * 0.5 );
		const pitchT = Math.atan2( this.vy, Math.max( this.speed, 0.5 ) ) * 0.8 + ( target.pitch || 0 );
		this.pitch += ( pitchT - this.pitch ) * Math.min( 1, dt * ( target.breach ? 2.5 : target.fluke ? 1.1 : 0.9 ) );
		this.arch += ( ( target.arch || 0 ) - this.arch ) * k;
		this.follow += ( ( target.follow ?? 0.85 ) - this.follow ) * Math.min( 1, dt * ( target.fluke ? 1.5 : 0.8 ) );
		this.strokeAmp += ( ( target.stroke ?? 0.1 ) - this.strokeAmp ) * Math.min( 1, dt * 0.6 );
		this.headPitch += ( ( target.blow ? 0.03 : 0 ) - this.headPitch ) * k;
		// tail beat: slow and heavy, ~5 s per stroke cruising, longer at the surface
		this.strokePhase += TAU * ( 0.09 + 0.042 * this.speed ) * dt;
		this.bob = - this.strokeAmp * 0.12 * Math.sin( this.strokePhase + 0.5 );
		this._flippers( dt, target );

		// ---- advance along the route (horizontal speed shrinks when steeply pitched)
		const du = this.speed * Math.cos( this.pitch ) * dt;
		this.u += du;
		this._place( dt );
		// path history (orientation at this travelled distance)
		this.arc += du;
		this._record( this.arc );

	}

	// depth of the highest point of the back below the water (m, > 0 = submerged)
	get backDepth() {

		return this.water - ( this.y + 1.25 );

	}

}

function mulberry( a:number ) {

	return () => {

		a |= 0; a = a + 0x6D2B79F5 | 0;
		let t = Math.imul( a ^ a >>> 15, 1 | a );
		t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;
		return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296;

	};

}

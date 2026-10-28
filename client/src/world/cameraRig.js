import * as THREE from 'three';

// A damped orbit camera around a point on the ground (copied from the
// mtg.ojee.net table, bounded by the scene's box). Input moves the goal;
// update() eases the real values toward it, so every motion — orbit, pan,
// zoom, fly-to — feels the same.
export default class CameraRig {
    constructor(camera, { minDist = 4, maxDist = 60, minPitch = 0.3, maxPitch = 1.45, bound = 40 } = {}) {
        this.camera = camera;
        this.limits = { minDist, maxDist, minPitch, maxPitch, bound };
        this.cur = { tx: 0, tz: 0, yaw: 0, pitch: 0.95, dist: 22 };
        this.goal = { ...this.cur };
        this.ease = 12; // 1/s
        this.flySpeed = null;
        this.apply();
    }

    setLimits(l) { Object.assign(this.limits, l); this._clampGoal(); }

    // Tilt follows zoom (opt-in): zoomed out you look down at the map, zoomed
    // in you drop toward the miniatures' eye level. A manual tilt is kept as
    // an offset on top of that curve, so zooming never undoes it.
    enableTiltCurve() { this.tiltCurve = true; this.tiltOffset = 0; }
    pitchFor(dist) { return 0.3 + 0.95 * (1 - Math.exp(-Math.max(0, dist - 2) / 14)); }
    // Up close the camera aims at chest height instead of the floor.
    lookHeight(dist) { return this.tiltCurve ? Math.max(0, 0.5 * (1 - (dist - 2.5) / 7)) : (this.lookY || 0); }

    _clampGoal() {
        const g = this.goal, l = this.limits;
        g.dist = Math.max(l.minDist, Math.min(l.maxDist, g.dist));
        g.pitch = Math.max(l.minPitch, Math.min(l.maxPitch, g.pitch));
        if (l.box) {
            g.tx = Math.max(l.box.x0, Math.min(l.box.x1, g.tx));
            g.tz = Math.max(l.box.z0, Math.min(l.box.z1, g.tz));
        } else {
            const r = Math.hypot(g.tx, g.tz);
            if (r > l.bound) { g.tx *= l.bound / r; g.tz *= l.bound / r; }
        }
    }

    orbit(dYaw, dPitch) {
        this.flySpeed = null;
        this.goal.yaw += dYaw;
        this.goal.pitch += dPitch;
        if (this.tiltCurve) this.tiltOffset = Math.max(-0.5, Math.min(0.5, this.tiltOffset + dPitch));
        this._clampGoal();
    }

    // Pan in screen terms: dx/dy in pixels, scaled so the felt under the
    // cursor stays under the cursor.
    pan(dxPx, dyPx, viewportH) {
        this.flySpeed = null;
        const g = this.goal;
        const worldPerPx = (2 * g.dist * Math.tan((this.camera.fov * Math.PI) / 360)) / viewportH;
        const right = { x: Math.cos(g.yaw), z: -Math.sin(g.yaw) };
        // "Up" on screen is away from the camera along the table.
        const fwd = { x: -Math.sin(g.yaw), z: -Math.cos(g.yaw) };
        const k = worldPerPx / Math.max(0.35, Math.sin(g.pitch));
        g.tx += -dxPx * worldPerPx * right.x + dyPx * k * fwd.x;
        g.tz += -dxPx * worldPerPx * right.z + dyPx * k * fwd.z;
        this._clampGoal();
    }

    // Move along the table in camera-relative directions (keyboard).
    nudge(forward, strafe, dt) {
        this.flySpeed = null;
        const g = this.goal;
        const speed = g.dist * 1.1 * dt;
        g.tx += (-Math.sin(g.yaw) * forward + Math.cos(g.yaw) * strafe) * speed;
        g.tz += (-Math.cos(g.yaw) * forward - Math.sin(g.yaw) * strafe) * speed;
        this._clampGoal();
    }

    // Zoom toward a table point (the felt under the cursor) so what you point
    // at stays put while everything else grows around it.
    zoomAt(factor, point) {
        this.flySpeed = null;
        const g = this.goal;
        const before = g.dist;
        g.dist = Math.max(this.limits.minDist, Math.min(this.limits.maxDist, g.dist * factor));
        if (this.tiltCurve) g.pitch = Math.max(this.limits.minPitch, Math.min(this.limits.maxPitch, this.pitchFor(g.dist) + this.tiltOffset));
        const k = 1 - g.dist / before;
        if (point && isFinite(k)) {
            g.tx += (point.x - g.tx) * k;
            g.tz += (point.z - g.tz) * k;
        }
        this._clampGoal();
    }

    flyTo(view, { instant = false } = {}) {
        const g = this.goal;
        if (view.tx !== undefined) g.tx = view.tx;
        if (view.tz !== undefined) g.tz = view.tz;
        if (view.pitch !== undefined) g.pitch = view.pitch;
        if (view.dist !== undefined) g.dist = view.dist;
        if (view.yaw !== undefined) {
            // Shortest way round.
            let d = view.yaw - this.cur.yaw;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            g.yaw = this.cur.yaw + d;
        }
        this._clampGoal();
        if (this.tiltCurve && view.pitch !== undefined) this.tiltOffset = Math.max(-0.5, Math.min(0.5, g.pitch - this.pitchFor(g.dist)));
        this.flySpeed = 6.5;
        if (instant) { Object.assign(this.cur, this.goal); this.apply(); }
    }

    // Returns true while still moving.
    update(dt) {
        const c = this.cur, g = this.goal;
        const k = 1 - Math.exp(-(this.flySpeed || this.ease) * dt);
        let moving = false;
        for (const key of ['tx', 'tz', 'yaw', 'pitch', 'dist']) {
            const d = g[key] - c[key];
            const eps = key === 'yaw' || key === 'pitch' ? 1e-4 : 1e-3;
            if (Math.abs(d) > eps) { c[key] += d * k; moving = true; } else c[key] = g[key];
        }
        if (!moving) this.flySpeed = null;
        this.apply();
        return moving;
    }

    apply() {
        const c = this.cur;
        const cp = Math.cos(c.pitch);
        const ly = this.lookHeight(c.dist);
        this.camera.position.set(
            c.tx + Math.sin(c.yaw) * cp * c.dist,
            ly + Math.sin(c.pitch) * c.dist,
            c.tz + Math.cos(c.yaw) * cp * c.dist,
        );
        _look.set(c.tx, ly, c.tz);
        this.camera.lookAt(_look);
    }
}

const _look = new THREE.Vector3();

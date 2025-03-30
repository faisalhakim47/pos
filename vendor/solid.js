
//#region rolldown:runtime
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", {
	value,
	configurable: true
});

//#endregion
//#region node_modules/solid-js/dist/solid.js
const sharedConfig = {
	context: void 0,
	registry: void 0,
	effects: void 0,
	done: false,
	getContextId() {
		return getContextId(this.context.count);
	},
	getNextContextId() {
		return getContextId(this.context.count++);
	}
};
function getContextId(count) {
	const num = String(count);
	const len = num.length - 1;
	return sharedConfig.context.id + (len ? String.fromCharCode(96 + len) : "") + num;
}
function setHydrateContext(context) {
	sharedConfig.context = context;
}
function nextHydrateContext() {
	return {
		...sharedConfig.context,
		id: sharedConfig.getNextContextId(),
		count: 0
	};
}
const IS_DEV = false;
const equalFn = (a, b) => a === b;
const $PROXY = Symbol("solid-proxy");
const SUPPORTS_PROXY = typeof Proxy === "function";
const $TRACK = Symbol("solid-track");
const $DEVCOMP = Symbol("solid-dev-component");
const signalOptions = { equals: equalFn };
let ERROR = null;
let runEffects = runQueue;
const STALE = 1;
const PENDING = 2;
const UNOWNED = {
	owned: null,
	cleanups: null,
	context: null,
	owner: null
};
var Owner = null;
let Transition = null;
let Scheduler = null;
let ExternalSourceConfig = null;
let Listener = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;
function createRoot(fn, detachedOwner) {
	const listener = Listener;
	const owner = Owner;
	const unowned = fn.length === 0;
	const current = detachedOwner === void 0 ? owner : detachedOwner;
	const root = unowned ? UNOWNED : {
		owned: null,
		cleanups: null,
		context: current ? current.context : null,
		owner: current
	};
	const updateFn = unowned ? fn : () => fn(() => untrack(() => cleanNode(root)));
	Owner = root;
	Listener = null;
	try {
		return runUpdates(updateFn, true);
	} finally {
		Listener = listener;
		Owner = owner;
	}
}
function createSignal(value, options) {
	options = options ? Object.assign({}, signalOptions, options) : signalOptions;
	const s = {
		value,
		observers: null,
		observerSlots: null,
		comparator: options.equals || void 0
	};
	const setter = (value$1) => {
		if (typeof value$1 === "function") if (Transition && Transition.running && Transition.sources.has(s)) value$1 = value$1(s.tValue);
		else value$1 = value$1(s.value);
		return writeSignal(s, value$1);
	};
	return [readSignal.bind(s), setter];
}
function createRenderEffect(fn, value, options) {
	const c = createComputation(fn, value, false, STALE);
	if (Scheduler && Transition && Transition.running) Updates.push(c);
	else updateComputation(c);
}
function createMemo(fn, value, options) {
	options = options ? Object.assign({}, signalOptions, options) : signalOptions;
	const c = createComputation(fn, value, true, 0);
	c.observers = null;
	c.observerSlots = null;
	c.comparator = options.equals || void 0;
	if (Scheduler && Transition && Transition.running) {
		c.tState = STALE;
		Updates.push(c);
	} else updateComputation(c);
	return readSignal.bind(c);
}
function batch(fn) {
	return runUpdates(fn, false);
}
function untrack(fn) {
	if (!ExternalSourceConfig && Listener === null) return fn();
	const listener = Listener;
	Listener = null;
	try {
		if (ExternalSourceConfig) return ExternalSourceConfig.untrack(fn);
		return fn();
	} finally {
		Listener = listener;
	}
}
function on(deps, fn, options) {
	const isArray = Array.isArray(deps);
	let prevInput;
	let defer = options && options.defer;
	return (prevValue) => {
		let input;
		if (isArray) {
			input = Array(deps.length);
			for (let i = 0; i < deps.length; i++) input[i] = deps[i]();
		} else input = deps();
		if (defer) {
			defer = false;
			return prevValue;
		}
		const result = untrack(() => fn(input, prevInput, prevValue));
		prevInput = input;
		return result;
	};
}
function onCleanup(fn) {
	if (Owner === null);
	else if (Owner.cleanups === null) Owner.cleanups = [fn];
	else Owner.cleanups.push(fn);
	return fn;
}
function getListener() {
	return Listener;
}
function getOwner() {
	return Owner;
}
function runWithOwner(o, fn) {
	const prev = Owner;
	const prevListener = Listener;
	Owner = o;
	Listener = null;
	try {
		return runUpdates(fn, true);
	} catch (err) {
		handleError(err);
	} finally {
		Owner = prev;
		Listener = prevListener;
	}
}
function startTransition(fn) {
	if (Transition && Transition.running) {
		fn();
		return Transition.done;
	}
	const l = Listener;
	const o = Owner;
	return Promise.resolve().then(() => {
		Listener = l;
		Owner = o;
		let t;
		if (Scheduler || SuspenseContext) {
			t = Transition || (Transition = {
				sources: new Set(),
				effects: [],
				promises: new Set(),
				disposed: new Set(),
				queue: new Set(),
				running: true
			});
			t.done || (t.done = new Promise((res) => t.resolve = res));
			t.running = true;
		}
		runUpdates(fn, false);
		Listener = Owner = null;
		return t ? t.done : void 0;
	});
}
const [transPending, setTransPending] = /* @__PURE__ */ createSignal(false);
function createContext(defaultValue, options) {
	const id = Symbol("context");
	return {
		id,
		Provider: createProvider(id),
		defaultValue
	};
}
function useContext(context) {
	let value;
	return Owner && Owner.context && (value = Owner.context[context.id]) !== void 0 ? value : context.defaultValue;
}
function children(fn) {
	const children$1 = createMemo(fn);
	const memo = createMemo(() => resolveChildren(children$1()));
	memo.toArray = () => {
		const c = memo();
		return Array.isArray(c) ? c : c != null ? [c] : [];
	};
	return memo;
}
let SuspenseContext;
function readSignal() {
	const runningTransition = Transition && Transition.running;
	if (this.sources && (runningTransition ? this.tState : this.state)) if ((runningTransition ? this.tState : this.state) === STALE) updateComputation(this);
	else {
		const updates = Updates;
		Updates = null;
		runUpdates(() => lookUpstream(this), false);
		Updates = updates;
	}
	if (Listener) {
		const sSlot = this.observers ? this.observers.length : 0;
		if (!Listener.sources) {
			Listener.sources = [this];
			Listener.sourceSlots = [sSlot];
		} else {
			Listener.sources.push(this);
			Listener.sourceSlots.push(sSlot);
		}
		if (!this.observers) {
			this.observers = [Listener];
			this.observerSlots = [Listener.sources.length - 1];
		} else {
			this.observers.push(Listener);
			this.observerSlots.push(Listener.sources.length - 1);
		}
	}
	if (runningTransition && Transition.sources.has(this)) return this.tValue;
	return this.value;
}
function writeSignal(node, value, isComp) {
	let current = Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value;
	if (!node.comparator || !node.comparator(current, value)) {
		if (Transition) {
			const TransitionRunning = Transition.running;
			if (TransitionRunning || !isComp && Transition.sources.has(node)) {
				Transition.sources.add(node);
				node.tValue = value;
			}
			if (!TransitionRunning) node.value = value;
		} else node.value = value;
		if (node.observers && node.observers.length) runUpdates(() => {
			for (let i = 0; i < node.observers.length; i += 1) {
				const o = node.observers[i];
				const TransitionRunning = Transition && Transition.running;
				if (TransitionRunning && Transition.disposed.has(o)) continue;
				if (TransitionRunning ? !o.tState : !o.state) {
					if (o.pure) Updates.push(o);
					else Effects.push(o);
					if (o.observers) markDownstream(o);
				}
				if (!TransitionRunning) o.state = STALE;
				else o.tState = STALE;
			}
			if (Updates.length > 1e6) {
				Updates = [];
				if (IS_DEV);
				throw new Error();
			}
		}, false);
	}
	return value;
}
function updateComputation(node) {
	if (!node.fn) return;
	cleanNode(node);
	const time = ExecCount;
	runComputation(node, Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value, time);
	if (Transition && !Transition.running && Transition.sources.has(node)) queueMicrotask(() => {
		runUpdates(() => {
			Transition && (Transition.running = true);
			Listener = Owner = node;
			runComputation(node, node.tValue, time);
			Listener = Owner = null;
		}, false);
	});
}
function runComputation(node, value, time) {
	let nextValue;
	const owner = Owner;
	const listener = Listener;
	Listener = Owner = node;
	try {
		nextValue = node.fn(value);
	} catch (err) {
		if (node.pure) if (Transition && Transition.running) {
			node.tState = STALE;
			node.tOwned && node.tOwned.forEach(cleanNode);
			node.tOwned = void 0;
		} else {
			node.state = STALE;
			node.owned && node.owned.forEach(cleanNode);
			node.owned = null;
		}
		node.updatedAt = time + 1;
		return handleError(err);
	} finally {
		Listener = listener;
		Owner = owner;
	}
	if (!node.updatedAt || node.updatedAt <= time) {
		if (node.updatedAt != null && "observers" in node) writeSignal(node, nextValue, true);
		else if (Transition && Transition.running && node.pure) {
			Transition.sources.add(node);
			node.tValue = nextValue;
		} else node.value = nextValue;
		node.updatedAt = time;
	}
}
function createComputation(fn, init, pure, state = STALE, options) {
	const c = {
		fn,
		state,
		updatedAt: null,
		owned: null,
		sources: null,
		sourceSlots: null,
		cleanups: null,
		value: init,
		owner: Owner,
		context: Owner ? Owner.context : null,
		pure
	};
	if (Transition && Transition.running) {
		c.state = 0;
		c.tState = state;
	}
	if (Owner === null);
	else if (Owner !== UNOWNED) if (Transition && Transition.running && Owner.pure) if (!Owner.tOwned) Owner.tOwned = [c];
	else Owner.tOwned.push(c);
	else if (!Owner.owned) Owner.owned = [c];
	else Owner.owned.push(c);
	if (ExternalSourceConfig && c.fn) {
		const [track, trigger] = createSignal(void 0, { equals: false });
		const ordinary = ExternalSourceConfig.factory(c.fn, trigger);
		onCleanup(() => ordinary.dispose());
		const triggerInTransition = () => startTransition(trigger).then(() => inTransition.dispose());
		const inTransition = ExternalSourceConfig.factory(c.fn, triggerInTransition);
		c.fn = (x) => {
			track();
			return Transition && Transition.running ? inTransition.track(x) : ordinary.track(x);
		};
	}
	return c;
}
function runTop(node) {
	const runningTransition = Transition && Transition.running;
	if ((runningTransition ? node.tState : node.state) === 0) return;
	if ((runningTransition ? node.tState : node.state) === PENDING) return lookUpstream(node);
	if (node.suspense && untrack(node.suspense.inFallback)) return node.suspense.effects.push(node);
	const ancestors = [node];
	while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
		if (runningTransition && Transition.disposed.has(node)) return;
		if (runningTransition ? node.tState : node.state) ancestors.push(node);
	}
	for (let i = ancestors.length - 1; i >= 0; i--) {
		node = ancestors[i];
		if (runningTransition) {
			let top = node;
			let prev = ancestors[i + 1];
			while ((top = top.owner) && top !== prev) if (Transition.disposed.has(top)) return;
		}
		if ((runningTransition ? node.tState : node.state) === STALE) updateComputation(node);
		else if ((runningTransition ? node.tState : node.state) === PENDING) {
			const updates = Updates;
			Updates = null;
			runUpdates(() => lookUpstream(node, ancestors[0]), false);
			Updates = updates;
		}
	}
}
function runUpdates(fn, init) {
	if (Updates) return fn();
	let wait = false;
	if (!init) Updates = [];
	if (Effects) wait = true;
	else Effects = [];
	ExecCount++;
	try {
		const res = fn();
		completeUpdates(wait);
		return res;
	} catch (err) {
		if (!wait) Effects = null;
		Updates = null;
		handleError(err);
	}
}
function completeUpdates(wait) {
	if (Updates) {
		if (Scheduler && Transition && Transition.running) scheduleQueue(Updates);
		else runQueue(Updates);
		Updates = null;
	}
	if (wait) return;
	let res;
	if (Transition) {
		if (!Transition.promises.size && !Transition.queue.size) {
			const sources = Transition.sources;
			const disposed = Transition.disposed;
			Effects.push.apply(Effects, Transition.effects);
			res = Transition.resolve;
			for (const e$1 of Effects) {
				"tState" in e$1 && (e$1.state = e$1.tState);
				delete e$1.tState;
			}
			Transition = null;
			runUpdates(() => {
				for (const d of disposed) cleanNode(d);
				for (const v of sources) {
					v.value = v.tValue;
					if (v.owned) for (let i = 0, len = v.owned.length; i < len; i++) cleanNode(v.owned[i]);
					if (v.tOwned) v.owned = v.tOwned;
					delete v.tValue;
					delete v.tOwned;
					v.tState = 0;
				}
				setTransPending(false);
			}, false);
		} else if (Transition.running) {
			Transition.running = false;
			Transition.effects.push.apply(Transition.effects, Effects);
			Effects = null;
			setTransPending(true);
			return;
		}
	}
	const e = Effects;
	Effects = null;
	if (e.length) runUpdates(() => runEffects(e), false);
	if (res) res();
}
function runQueue(queue) {
	for (let i = 0; i < queue.length; i++) runTop(queue[i]);
}
function scheduleQueue(queue) {
	for (let i = 0; i < queue.length; i++) {
		const item = queue[i];
		const tasks = Transition.queue;
		if (!tasks.has(item)) {
			tasks.add(item);
			Scheduler(() => {
				tasks.delete(item);
				runUpdates(() => {
					Transition.running = true;
					runTop(item);
				}, false);
				Transition && (Transition.running = false);
			});
		}
	}
}
function lookUpstream(node, ignore) {
	const runningTransition = Transition && Transition.running;
	if (runningTransition) node.tState = 0;
	else node.state = 0;
	for (let i = 0; i < node.sources.length; i += 1) {
		const source = node.sources[i];
		if (source.sources) {
			const state = runningTransition ? source.tState : source.state;
			if (state === STALE) {
				if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount)) runTop(source);
			} else if (state === PENDING) lookUpstream(source, ignore);
		}
	}
}
function markDownstream(node) {
	const runningTransition = Transition && Transition.running;
	for (let i = 0; i < node.observers.length; i += 1) {
		const o = node.observers[i];
		if (runningTransition ? !o.tState : !o.state) {
			if (runningTransition) o.tState = PENDING;
			else o.state = PENDING;
			if (o.pure) Updates.push(o);
			else Effects.push(o);
			o.observers && markDownstream(o);
		}
	}
}
function cleanNode(node) {
	let i;
	if (node.sources) while (node.sources.length) {
		const source = node.sources.pop();
		const index = node.sourceSlots.pop();
		const obs = source.observers;
		if (obs && obs.length) {
			const n = obs.pop();
			const s = source.observerSlots.pop();
			if (index < obs.length) {
				n.sourceSlots[s] = index;
				obs[index] = n;
				source.observerSlots[index] = s;
			}
		}
	}
	if (node.tOwned) {
		for (i = node.tOwned.length - 1; i >= 0; i--) cleanNode(node.tOwned[i]);
		delete node.tOwned;
	}
	if (Transition && Transition.running && node.pure) reset(node, true);
	else if (node.owned) {
		for (i = node.owned.length - 1; i >= 0; i--) cleanNode(node.owned[i]);
		node.owned = null;
	}
	if (node.cleanups) {
		for (i = node.cleanups.length - 1; i >= 0; i--) node.cleanups[i]();
		node.cleanups = null;
	}
	if (Transition && Transition.running) node.tState = 0;
	else node.state = 0;
}
function reset(node, top) {
	if (!top) {
		node.tState = 0;
		Transition.disposed.add(node);
	}
	if (node.owned) for (let i = 0; i < node.owned.length; i++) reset(node.owned[i]);
}
function castError(err) {
	if (err instanceof Error) return err;
	return new Error(typeof err === "string" ? err : "Unknown error", { cause: err });
}
function runErrors(err, fns, owner) {
	try {
		for (const f of fns) f(err);
	} catch (e) {
		handleError(e, owner && owner.owner || null);
	}
}
function handleError(err, owner = Owner) {
	const fns = ERROR && owner && owner.context && owner.context[ERROR];
	const error = castError(err);
	if (!fns) throw error;
	if (Effects) Effects.push({
		fn() {
			runErrors(error, fns, owner);
		},
		state: STALE
	});
	else runErrors(error, fns, owner);
}
function resolveChildren(children$1) {
	if (typeof children$1 === "function" && !children$1.length) return resolveChildren(children$1());
	if (Array.isArray(children$1)) {
		const results = [];
		for (let i = 0; i < children$1.length; i++) {
			const result = resolveChildren(children$1[i]);
			Array.isArray(result) ? results.push.apply(results, result) : results.push(result);
		}
		return results;
	}
	return children$1;
}
function createProvider(id, options) {
	return function provider(props) {
		let res;
		createRenderEffect(() => res = untrack(() => {
			Owner.context = {
				...Owner.context,
				[id]: props.value
			};
			return children(() => props.children);
		}), void 0);
		return res;
	};
}
const FALLBACK = Symbol("fallback");
let hydrationEnabled = false;
function createComponent(Comp, props) {
	if (hydrationEnabled) {
		if (sharedConfig.context) {
			const c = sharedConfig.context;
			setHydrateContext(nextHydrateContext());
			const r = untrack(() => Comp(props || {}));
			setHydrateContext(c);
			return r;
		}
	}
	return untrack(() => Comp(props || {}));
}
function trueFn() {
	return true;
}
const propTraps = {
	get(_, property, receiver) {
		if (property === $PROXY) return receiver;
		return _.get(property);
	},
	has(_, property) {
		if (property === $PROXY) return true;
		return _.has(property);
	},
	set: trueFn,
	deleteProperty: trueFn,
	getOwnPropertyDescriptor(_, property) {
		return {
			configurable: true,
			enumerable: true,
			get() {
				return _.get(property);
			},
			set: trueFn,
			deleteProperty: trueFn
		};
	},
	ownKeys(_) {
		return _.keys();
	}
};
function resolveSource(s) {
	return !(s = typeof s === "function" ? s() : s) ? {} : s;
}
function resolveSources() {
	for (let i = 0, length = this.length; i < length; ++i) {
		const v = this[i]();
		if (v !== void 0) return v;
	}
}
function mergeProps(...sources) {
	let proxy = false;
	for (let i = 0; i < sources.length; i++) {
		const s = sources[i];
		proxy = proxy || !!s && $PROXY in s;
		sources[i] = typeof s === "function" ? (proxy = true, createMemo(s)) : s;
	}
	if (SUPPORTS_PROXY && proxy) return new Proxy({
		get(property) {
			for (let i = sources.length - 1; i >= 0; i--) {
				const v = resolveSource(sources[i])[property];
				if (v !== void 0) return v;
			}
		},
		has(property) {
			for (let i = sources.length - 1; i >= 0; i--) if (property in resolveSource(sources[i])) return true;
			return false;
		},
		keys() {
			const keys = [];
			for (let i = 0; i < sources.length; i++) keys.push(...Object.keys(resolveSource(sources[i])));
			return [...new Set(keys)];
		}
	}, propTraps);
	const sourcesMap = {};
	const defined = Object.create(null);
	for (let i = sources.length - 1; i >= 0; i--) {
		const source = sources[i];
		if (!source) continue;
		const sourceKeys = Object.getOwnPropertyNames(source);
		for (let i$1 = sourceKeys.length - 1; i$1 >= 0; i$1--) {
			const key = sourceKeys[i$1];
			if (key === "__proto__" || key === "constructor") continue;
			const desc = Object.getOwnPropertyDescriptor(source, key);
			if (!defined[key]) defined[key] = desc.get ? {
				enumerable: true,
				configurable: true,
				get: resolveSources.bind(sourcesMap[key] = [desc.get.bind(source)])
			} : desc.value !== void 0 ? desc : void 0;
			else {
				const sources$1 = sourcesMap[key];
				if (sources$1) {
					if (desc.get) sources$1.push(desc.get.bind(source));
					else if (desc.value !== void 0) sources$1.push(() => desc.value);
				}
			}
		}
	}
	const target = {};
	const definedKeys = Object.keys(defined);
	for (let i = definedKeys.length - 1; i >= 0; i--) {
		const key = definedKeys[i];
		const desc = defined[key];
		if (desc && desc.get) Object.defineProperty(target, key, desc);
		else target[key] = desc ? desc.value : void 0;
	}
	return target;
}
const narrowedError = (name) => `Stale read from <${name}>.`;
function Show(props) {
	const keyed = props.keyed;
	const conditionValue = createMemo(() => props.when, void 0, void 0);
	const condition = keyed ? conditionValue : createMemo(conditionValue, void 0, { equals: (a, b) => !a === !b });
	return createMemo(() => {
		const c = condition();
		if (c) {
			const child = props.children;
			const fn = typeof child === "function" && child.length > 0;
			return fn ? untrack(() => child(keyed ? c : () => {
				if (!untrack(condition)) throw narrowedError("Show");
				return conditionValue();
			})) : child;
		}
		return props.fallback;
	}, void 0, void 0);
}
let Errors;
function resetErrorBoundaries() {
	Errors && [...Errors].forEach((fn) => fn());
}

//#endregion
//#region node_modules/solid-js/web/dist/web.js
const booleans = [
	"allowfullscreen",
	"async",
	"autofocus",
	"autoplay",
	"checked",
	"controls",
	"default",
	"disabled",
	"formnovalidate",
	"hidden",
	"indeterminate",
	"inert",
	"ismap",
	"loop",
	"multiple",
	"muted",
	"nomodule",
	"novalidate",
	"open",
	"playsinline",
	"readonly",
	"required",
	"reversed",
	"seamless",
	"selected"
];
const Properties = /* @__PURE__ */ new Set([
	"className",
	"value",
	"readOnly",
	"formNoValidate",
	"isMap",
	"noModule",
	"playsInline",
	...booleans
]);
const ChildProperties = /* @__PURE__ */ new Set([
	"innerHTML",
	"textContent",
	"innerText",
	"children"
]);
const Aliases = /* @__PURE__ */ Object.assign(Object.create(null), {
	className: "class",
	htmlFor: "for"
});
const PropAliases = /* @__PURE__ */ Object.assign(Object.create(null), {
	class: "className",
	formnovalidate: {
		$: "formNoValidate",
		BUTTON: 1,
		INPUT: 1
	},
	ismap: {
		$: "isMap",
		IMG: 1
	},
	nomodule: {
		$: "noModule",
		SCRIPT: 1
	},
	playsinline: {
		$: "playsInline",
		VIDEO: 1
	},
	readonly: {
		$: "readOnly",
		INPUT: 1,
		TEXTAREA: 1
	}
});
function getPropAlias(prop, tagName$1) {
	const a = PropAliases[prop];
	return typeof a === "object" ? a[tagName$1] ? a["$"] : void 0 : a;
}
const DelegatedEvents = /* @__PURE__ */ new Set([
	"beforeinput",
	"click",
	"dblclick",
	"contextmenu",
	"focusin",
	"focusout",
	"input",
	"keydown",
	"keyup",
	"mousedown",
	"mousemove",
	"mouseout",
	"mouseover",
	"mouseup",
	"pointerdown",
	"pointermove",
	"pointerout",
	"pointerover",
	"pointerup",
	"touchend",
	"touchmove",
	"touchstart"
]);
const SVGElements = /* @__PURE__ */ new Set([
	"altGlyph",
	"altGlyphDef",
	"altGlyphItem",
	"animate",
	"animateColor",
	"animateMotion",
	"animateTransform",
	"circle",
	"clipPath",
	"color-profile",
	"cursor",
	"defs",
	"desc",
	"ellipse",
	"feBlend",
	"feColorMatrix",
	"feComponentTransfer",
	"feComposite",
	"feConvolveMatrix",
	"feDiffuseLighting",
	"feDisplacementMap",
	"feDistantLight",
	"feDropShadow",
	"feFlood",
	"feFuncA",
	"feFuncB",
	"feFuncG",
	"feFuncR",
	"feGaussianBlur",
	"feImage",
	"feMerge",
	"feMergeNode",
	"feMorphology",
	"feOffset",
	"fePointLight",
	"feSpecularLighting",
	"feSpotLight",
	"feTile",
	"feTurbulence",
	"filter",
	"font",
	"font-face",
	"font-face-format",
	"font-face-name",
	"font-face-src",
	"font-face-uri",
	"foreignObject",
	"g",
	"glyph",
	"glyphRef",
	"hkern",
	"image",
	"line",
	"linearGradient",
	"marker",
	"mask",
	"metadata",
	"missing-glyph",
	"mpath",
	"path",
	"pattern",
	"polygon",
	"polyline",
	"radialGradient",
	"rect",
	"set",
	"stop",
	"svg",
	"switch",
	"symbol",
	"text",
	"textPath",
	"tref",
	"tspan",
	"use",
	"view",
	"vkern"
]);
const SVGNamespace = {
	xlink: "http://www.w3.org/1999/xlink",
	xml: "http://www.w3.org/XML/1998/namespace"
};
function reconcileArrays(parentNode, a, b) {
	let bLength = b.length;
	let aEnd = a.length;
	let bEnd = bLength;
	let aStart = 0;
	let bStart = 0;
	let after = a[aEnd - 1].nextSibling;
	let map = null;
	while (aStart < aEnd || bStart < bEnd) {
		if (a[aStart] === b[bStart]) {
			aStart++;
			bStart++;
			continue;
		}
		while (a[aEnd - 1] === b[bEnd - 1]) {
			aEnd--;
			bEnd--;
		}
		if (aEnd === aStart) {
			const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
			while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
		} else if (bEnd === bStart) while (aStart < aEnd) {
			if (!map || !map.has(a[aStart])) a[aStart].remove();
			aStart++;
		}
		else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
			const node = a[--aEnd].nextSibling;
			parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
			parentNode.insertBefore(b[--bEnd], node);
			a[aEnd] = b[bEnd];
		} else {
			if (!map) {
				map = new Map();
				let i = bStart;
				while (i < bEnd) map.set(b[i], i++);
			}
			const index = map.get(a[aStart]);
			if (index != null) if (bStart < index && index < bEnd) {
				let i = aStart;
				let sequence = 1;
				let t;
				while (++i < aEnd && i < bEnd) {
					if ((t = map.get(a[i])) == null || t !== index + sequence) break;
					sequence++;
				}
				if (sequence > index - bStart) {
					const node = a[aStart];
					while (bStart < index) parentNode.insertBefore(b[bStart++], node);
				} else parentNode.replaceChild(b[bStart++], a[aStart++]);
			} else aStart++;
			else a[aStart++].remove();
		}
	}
}
const $$EVENTS = "_$DX_DELEGATE";
function render(code, element, init, options = {}) {
	let disposer;
	createRoot((dispose) => {
		disposer = dispose;
		element === document ? code() : insert(element, code(), element.firstChild ? null : void 0, init);
	}, options.owner);
	return () => {
		disposer();
		element.textContent = "";
	};
}
function delegateEvents(eventNames, document$1 = window.document) {
	const e = document$1[$$EVENTS] || (document$1[$$EVENTS] = new Set());
	for (let i = 0, l = eventNames.length; i < l; i++) {
		const name = eventNames[i];
		if (!e.has(name)) {
			e.add(name);
			document$1.addEventListener(name, eventHandler);
		}
	}
}
function setAttribute(node, name, value) {
	if (isHydrating(node)) return;
	if (value == null) node.removeAttribute(name);
	else node.setAttribute(name, value);
}
function setAttributeNS(node, namespace, name, value) {
	if (isHydrating(node)) return;
	if (value == null) node.removeAttributeNS(namespace, name);
	else node.setAttributeNS(namespace, name, value);
}
function setBoolAttribute(node, name, value) {
	if (isHydrating(node)) return;
	value ? node.setAttribute(name, "") : node.removeAttribute(name);
}
function className(node, value) {
	if (isHydrating(node)) return;
	if (value == null) node.removeAttribute("class");
	else node.className = value;
}
function addEventListener(node, name, handler, delegate) {
	if (delegate) if (Array.isArray(handler)) {
		node[`$$${name}`] = handler[0];
		node[`$$${name}Data`] = handler[1];
	} else node[`$$${name}`] = handler;
	else if (Array.isArray(handler)) {
		const handlerFn = handler[0];
		node.addEventListener(name, handler[0] = (e) => handlerFn.call(node, handler[1], e));
	} else node.addEventListener(name, handler, typeof handler !== "function" && handler);
}
function classList(node, value, prev = {}) {
	const classKeys = Object.keys(value || {});
	const prevKeys = Object.keys(prev);
	let i;
	let len;
	for (i = 0, len = prevKeys.length; i < len; i++) {
		const key = prevKeys[i];
		if (!key || key === "undefined" || value[key]) continue;
		toggleClassKey(node, key, false);
		delete prev[key];
	}
	for (i = 0, len = classKeys.length; i < len; i++) {
		const key = classKeys[i];
		const classValue = !!value[key];
		if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
		toggleClassKey(node, key, true);
		prev[key] = classValue;
	}
	return prev;
}
function style(node, value, prev) {
	if (!value) return prev ? setAttribute(node, "style") : value;
	const nodeStyle = node.style;
	if (typeof value === "string") return nodeStyle.cssText = value;
	typeof prev === "string" && (nodeStyle.cssText = prev = void 0);
	prev || (prev = {});
	value || (value = {});
	let v;
	let s;
	for (s in prev) {
		value[s] ?? nodeStyle.removeProperty(s);
		delete prev[s];
	}
	for (s in value) {
		v = value[s];
		if (v !== prev[s]) {
			nodeStyle.setProperty(s, v);
			prev[s] = v;
		}
	}
	return prev;
}
function spread(node, props = {}, isSVG, skipChildren) {
	const prevProps = {};
	if (!skipChildren) createRenderEffect(() => prevProps.children = insertExpression(node, props.children, prevProps.children));
	createRenderEffect(() => typeof props.ref === "function" && use(props.ref, node));
	createRenderEffect(() => assign(node, props, isSVG, true, prevProps, true));
	return prevProps;
}
function dynamicProperty(props, key) {
	const src = props[key];
	Object.defineProperty(props, key, {
		get() {
			return src();
		},
		enumerable: true
	});
	return props;
}
function use(fn, element, arg) {
	return untrack(() => fn(element, arg));
}
function insert(parent, accessor, marker$1, initial) {
	if (marker$1 !== void 0 && !initial) initial = [];
	if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker$1);
	createRenderEffect((current) => insertExpression(parent, accessor(), current, marker$1), initial);
}
function assign(node, props, isSVG, skipChildren, prevProps = {}, skipRef = false) {
	props || (props = {});
	for (const prop in prevProps) if (!(prop in props)) {
		if (prop === "children") continue;
		prevProps[prop] = assignProp(node, prop, null, prevProps[prop], isSVG, skipRef, props);
	}
	for (const prop in props) {
		if (prop === "children") {
			if (!skipChildren) insertExpression(node, props.children);
			continue;
		}
		const value = props[prop];
		prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG, skipRef, props);
	}
}
function isHydrating(node) {
	return !!sharedConfig.context && !sharedConfig.done && (!node || node.isConnected);
}
function toPropertyName$1(name) {
	return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
}
__name(toPropertyName$1, "toPropertyName");
function toggleClassKey(node, key, value) {
	const classNames = key.trim().split(/\s+/);
	for (let i = 0, nameLen = classNames.length; i < nameLen; i++) node.classList.toggle(classNames[i], value);
}
function assignProp(node, prop, value, prev, isSVG, skipRef, props) {
	let isCE;
	let isProp;
	let isChildProp;
	let propAlias;
	let forceProp;
	if (prop === "style") return style(node, value, prev);
	if (prop === "classList") return classList(node, value, prev);
	if (value === prev) return prev;
	if (prop === "ref") {
		if (!skipRef) value(node);
	} else if (prop.slice(0, 3) === "on:") {
		const e = prop.slice(3);
		prev && node.removeEventListener(e, prev, typeof prev !== "function" && prev);
		value && node.addEventListener(e, value, typeof value !== "function" && value);
	} else if (prop.slice(0, 10) === "oncapture:") {
		const e = prop.slice(10);
		prev && node.removeEventListener(e, prev, true);
		value && node.addEventListener(e, value, true);
	} else if (prop.slice(0, 2) === "on") {
		const name = prop.slice(2).toLowerCase();
		const delegate = DelegatedEvents.has(name);
		if (!delegate && prev) {
			const h = Array.isArray(prev) ? prev[0] : prev;
			node.removeEventListener(name, h);
		}
		if (delegate || value) {
			addEventListener(node, name, value, delegate);
			delegate && delegateEvents([name]);
		}
	} else if (prop.slice(0, 5) === "attr:") setAttribute(node, prop.slice(5), value);
	else if (prop.slice(0, 5) === "bool:") setBoolAttribute(node, prop.slice(5), value);
	else if ((forceProp = prop.slice(0, 5) === "prop:") || (isChildProp = ChildProperties.has(prop)) || !isSVG && ((propAlias = getPropAlias(prop, node.tagName)) || (isProp = Properties.has(prop))) || (isCE = node.nodeName.includes("-") || "is" in props)) {
		if (forceProp) {
			prop = prop.slice(5);
			isProp = true;
		} else if (isHydrating(node)) return value;
		if (prop === "class" || prop === "className") className(node, value);
		else if (isCE && !isProp && !isChildProp) node[toPropertyName$1(prop)] = value;
		else node[propAlias || prop] = value;
	} else {
		const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
		if (ns) setAttributeNS(node, ns, prop, value);
		else setAttribute(node, Aliases[prop] || prop, value);
	}
	return value;
}
function eventHandler(e) {
	if (sharedConfig.registry && sharedConfig.events) {
		if (sharedConfig.events.find(([el, ev]) => ev === e)) return;
	}
	let node = e.target;
	const key = `$$${e.type}`;
	const oriTarget = e.target;
	const oriCurrentTarget = e.currentTarget;
	const retarget = (value) => Object.defineProperty(e, "target", {
		configurable: true,
		value
	});
	const handleNode = () => {
		const handler = node[key];
		if (handler && !node.disabled) {
			const data = node[`${key}Data`];
			data !== void 0 ? handler.call(node, data, e) : handler.call(node, e);
			if (e.cancelBubble) return;
		}
		node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
		return true;
	};
	const walkUpTree = () => {
		while (handleNode() && (node = node._$host || node.parentNode || node.host));
	};
	Object.defineProperty(e, "currentTarget", {
		configurable: true,
		get() {
			return node || document;
		}
	});
	if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = _$HY.done = true;
	if (e.composedPath) {
		const path = e.composedPath();
		retarget(path[0]);
		for (let i = 0; i < path.length - 2; i++) {
			node = path[i];
			if (!handleNode()) break;
			if (node._$host) {
				node = node._$host;
				walkUpTree();
				break;
			}
			if (node.parentNode === oriCurrentTarget) break;
		}
	} else walkUpTree();
	retarget(oriTarget);
}
function insertExpression(parent, value, current, marker$1, unwrapArray) {
	const hydrating = isHydrating(parent);
	if (hydrating) {
		!current && (current = [...parent.childNodes]);
		let cleaned = [];
		for (let i = 0; i < current.length; i++) {
			const node = current[i];
			if (node.nodeType === 8 && node.data.slice(0, 2) === "!$") node.remove();
			else cleaned.push(node);
		}
		current = cleaned;
	}
	while (typeof current === "function") current = current();
	if (value === current) return current;
	const t = typeof value;
	const multi = marker$1 !== void 0;
	parent = multi && current[0] && current[0].parentNode || parent;
	if (t === "string" || t === "number") {
		if (hydrating) return current;
		if (t === "number") {
			value = value.toString();
			if (value === current) return current;
		}
		if (multi) {
			let node = current[0];
			if (node && node.nodeType === 3) node.data !== value && (node.data = value);
			else node = document.createTextNode(value);
			current = cleanChildren(parent, current, marker$1, node);
		} else if (current !== "" && typeof current === "string") current = parent.firstChild.data = value;
		else current = parent.textContent = value;
	} else if (value == null || t === "boolean") {
		if (hydrating) return current;
		current = cleanChildren(parent, current, marker$1);
	} else if (t === "function") {
		createRenderEffect(() => {
			let v = value();
			while (typeof v === "function") v = v();
			current = insertExpression(parent, v, current, marker$1);
		});
		return () => current;
	} else if (Array.isArray(value)) {
		const array = [];
		const currentArray = current && Array.isArray(current);
		if (normalizeIncomingArray(array, value, current, unwrapArray)) {
			createRenderEffect(() => current = insertExpression(parent, array, current, marker$1, true));
			return () => current;
		}
		if (hydrating) {
			if (!array.length) return current;
			if (marker$1 === void 0) return current = [...parent.childNodes];
			let node = array[0];
			if (node.parentNode !== parent) return current;
			const nodes = [node];
			while ((node = node.nextSibling) !== marker$1) nodes.push(node);
			return current = nodes;
		}
		if (array.length === 0) {
			current = cleanChildren(parent, current, marker$1);
			if (multi) return current;
		} else if (currentArray) if (current.length === 0) appendNodes(parent, array, marker$1);
		else reconcileArrays(parent, current, array);
		else {
			current && cleanChildren(parent);
			appendNodes(parent, array);
		}
		current = array;
	} else if (value.nodeType) {
		if (hydrating && value.parentNode) return current = multi ? [value] : value;
		if (Array.isArray(current)) {
			if (multi) return current = cleanChildren(parent, current, marker$1, value);
			cleanChildren(parent, current, null, value);
		} else if (current == null || current === "" || !parent.firstChild) parent.appendChild(value);
		else parent.replaceChild(value, parent.firstChild);
		current = value;
	}
	return current;
}
function normalizeIncomingArray(normalized, array, current, unwrap) {
	let dynamic = false;
	for (let i = 0, len = array.length; i < len; i++) {
		let item = array[i];
		let prev = current && current[normalized.length];
		let t;
		if (item == null || item === true || item === false);
		else if ((t = typeof item) === "object" && item.nodeType) normalized.push(item);
		else if (Array.isArray(item)) dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic;
		else if (t === "function") if (unwrap) {
			while (typeof item === "function") item = item();
			dynamic = normalizeIncomingArray(normalized, Array.isArray(item) ? item : [item], Array.isArray(prev) ? prev : [prev]) || dynamic;
		} else {
			normalized.push(item);
			dynamic = true;
		}
		else {
			const value = String(item);
			if (prev && prev.nodeType === 3 && prev.data === value) normalized.push(prev);
			else normalized.push(document.createTextNode(value));
		}
	}
	return dynamic;
}
function appendNodes(parent, array, marker$1 = null) {
	for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker$1);
}
function cleanChildren(parent, current, marker$1, replacement) {
	if (marker$1 === void 0) return parent.textContent = "";
	const node = replacement || document.createTextNode("");
	if (current.length) {
		let inserted = false;
		for (let i = current.length - 1; i >= 0; i--) {
			const el = current[i];
			if (node !== el) {
				const isParent = el.parentNode === parent;
				if (!inserted && !i) isParent ? parent.replaceChild(node, el) : parent.insertBefore(node, marker$1);
				else isParent && el.remove();
			} else inserted = true;
		}
	} else parent.insertBefore(node, marker$1);
	return [node];
}
const voidFn = () => void 0;
const RequestContext = Symbol();
const isServer = false;

//#endregion
//#region node_modules/solid-js/html/dist/html.js
const tagRE = /(?:<!--[\S\s]*?-->|<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>)/g;
const attrRE = /(?:\s(?<boolean>[^/\s><=]+?)(?=[\s/>]))|(?:(?<name>\S+?)(?:\s*=\s*(?:(['"])(?<quotedValue>[\s\S]*?)\3|(?<unquotedValue>[^\s>]+))))/g;
const lookup = {
	area: true,
	base: true,
	br: true,
	col: true,
	embed: true,
	hr: true,
	img: true,
	input: true,
	keygen: true,
	link: true,
	menuitem: true,
	meta: true,
	param: true,
	source: true,
	track: true,
	wbr: true
};
function parseTag(tag) {
	const res = {
		type: "tag",
		name: "",
		voidElement: false,
		attrs: [],
		children: []
	};
	const tagMatch = tag.match(/<\/?([^\s]+?)[/\s>]/);
	if (tagMatch) {
		res.name = tagMatch[1];
		if (lookup[tagMatch[1].toLowerCase()] || tag.charAt(tag.length - 2) === "/") res.voidElement = true;
		if (res.name.startsWith("!--")) {
			const endIndex = tag.indexOf("-->");
			return {
				type: "comment",
				comment: endIndex !== -1 ? tag.slice(4, endIndex) : ""
			};
		}
	}
	const reg = new RegExp(attrRE);
	for (const match of tag.matchAll(reg)) if ((match[1] || match[2]).startsWith("use:")) res.attrs.push({
		type: "directive",
		name: match[1] || match[2],
		value: match[4] || match[5] || ""
	});
	else res.attrs.push({
		type: "attr",
		name: match[1] || match[2],
		value: match[4] || match[5] || ""
	});
	return res;
}
function pushTextNode(list, html$1, start) {
	const end = html$1.indexOf("<", start);
	const content = html$1.slice(start, end === -1 ? void 0 : end);
	if (!/^\s*$/.test(content)) list.push({
		type: "text",
		content
	});
}
function pushCommentNode(list, tag) {
	const content = tag.replace("<!--", "").replace("-->", "");
	if (!/^\s*$/.test(content)) list.push({
		type: "comment",
		content
	});
}
function parse(html$1) {
	const result = [];
	let current = void 0;
	let level = -1;
	const arr = [];
	const byTag = {};
	html$1.replace(tagRE, (tag, index) => {
		const isOpen = tag.charAt(1) !== "/";
		const isComment = tag.slice(0, 4) === "<!--";
		const start = index + tag.length;
		const nextChar = html$1.charAt(start);
		let parent = void 0;
		if (isOpen && !isComment) {
			level++;
			current = parseTag(tag);
			if (!current.voidElement && nextChar && nextChar !== "<") pushTextNode(current.children, html$1, start);
			byTag[current.tagName] = current;
			if (level === 0) result.push(current);
			parent = arr[level - 1];
			if (parent) parent.children.push(current);
			arr[level] = current;
		}
		if (isComment) if (level < 0) pushCommentNode(result, tag);
		else pushCommentNode(arr[level].children, tag);
		if (isComment || !isOpen || current.voidElement) {
			if (!isComment) level--;
			if (nextChar !== "<" && nextChar) {
				parent = level === -1 ? result : arr[level].children;
				pushTextNode(parent, html$1, start);
			}
		}
	});
	return result;
}
function attrString(attrs) {
	const buff = [];
	for (const attr of attrs) buff.push(attr.name + "=\"" + attr.value.replace(/"/g, "&quot;") + "\"");
	if (!buff.length) return "";
	return " " + buff.join(" ");
}
function stringifier(buff, doc) {
	switch (doc.type) {
		case "text": return buff + doc.content;
		case "tag":
			buff += "<" + doc.name + (doc.attrs ? attrString(doc.attrs) : "") + (doc.voidElement ? "/>" : ">");
			if (doc.voidElement) return buff;
			return buff + doc.children.reduce(stringifier, "") + "</" + doc.name + ">";
		case "comment": return buff += "<!--" + doc.content + "-->";
	}
}
function stringify(doc) {
	return doc.reduce(function(token, rootEl) {
		return token + stringifier("", rootEl);
	}, "");
}
const cache = new Map();
const VOID_ELEMENTS = /^(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr)$/i;
const spaces = " \\f\\n\\r\\t";
const almostEverything = "[^" + spaces + "\\/>\"'=]+";
const attrName = "[ " + spaces + "]+(?:use:<!--#-->|" + almostEverything + ")";
const tagName = "<([A-Za-z$#]+[A-Za-z0-9:_-]*)((?:";
const attrPartials = "(?:\\s*=\\s*(?:'[^']*?'|\"[^\"]*?\"|\\([^)]*?\\)|<[^>]*?>|" + almostEverything + "))?)";
const attrSeeker = new RegExp(tagName + attrName + attrPartials + "+)([ " + spaces + "]*/?>)", "g");
const findAttributes = new RegExp("(" + attrName + "\\s*=\\s*)(<!--#-->|['\"(]([\\w\\s]*<!--#-->[\\w\\s]*)*['\")])", "gi");
const selfClosing = new RegExp(tagName + attrName + attrPartials + "*)([ " + spaces + "]*/>)", "g");
const marker = "<!--#-->";
const reservedNameSpaces = new Set([
	"class",
	"on",
	"oncapture",
	"style",
	"use",
	"prop",
	"attr"
]);
function attrReplacer($0, $1, $2, $3) {
	return "<" + $1 + $2.replace(findAttributes, replaceAttributes) + $3;
}
function replaceAttributes($0, $1, $2) {
	return $1.replace(/<!--#-->/g, "###") + ($2[0] === "\"" || $2[0] === "'" ? $2.replace(/<!--#-->/g, "###") : "\"###\"");
}
function fullClosing($0, $1, $2) {
	return VOID_ELEMENTS.test($1) ? $0 : "<" + $1 + $2 + "></" + $1 + ">";
}
function toPropertyName(name) {
	return name.toLowerCase().replace(/-([a-z])/g, (_, w) => w.toUpperCase());
}
function parseDirective(name, value, tag, options) {
	if (name === "use:###" && value === "###") {
		const count = options.counter++;
		options.exprs.push(`typeof exprs[${count}] === "function" ? r.use(exprs[${count}], ${tag}, exprs[${options.counter++}]) : (()=>{throw new Error("use:### must be a function")})()`);
	} else throw new Error(`Not support syntax ${name} must be use:{function}`);
}
function createHTML(r, { delegateEvents: delegateEvents$1 = true, functionBuilder = (...args) => new Function(...args) } = {}) {
	let uuid = 1;
	r.wrapProps = (props) => {
		const d = Object.getOwnPropertyDescriptors(props);
		for (const k in d) if (typeof d[k].value === "function" && !d[k].value.length) r.dynamicProperty(props, k);
		return props;
	};
	function createTemplate(statics, opt) {
		let i = 0;
		let markup = "";
		for (; i < statics.length - 1; i++) markup = markup + statics[i] + "<!--#-->";
		markup = markup + statics[i];
		const replaceList = [
			[selfClosing, fullClosing],
			[/<(<!--#-->)/g, "<###"],
			[/\.\.\.(<!--#-->)/g, "###"],
			[attrSeeker, attrReplacer],
			[/>\n+\s*/g, ">"],
			[/\n+\s*</g, "<"],
			[/\s+</g, " <"],
			[/>\s+/g, "> "]
		];
		markup = replaceList.reduce((acc, x) => {
			return acc.replace(x[0], x[1]);
		}, markup);
		const pars = parse(markup);
		const [html$2, code] = parseTemplate(pars, opt.funcBuilder);
		const templates = [];
		for (let i$1 = 0; i$1 < html$2.length; i$1++) {
			templates.push(document.createElement("template"));
			templates[i$1].innerHTML = html$2[i$1];
			const nomarkers = templates[i$1].content.querySelectorAll("script,style");
			for (let j = 0; j < nomarkers.length; j++) {
				const d = nomarkers[j].firstChild?.data || "";
				if (d.indexOf(marker) > -1) {
					const parts = d.split(marker).reduce((memo, p, i$2) => {
						i$2 && memo.push("");
						memo.push(p);
						return memo;
					}, []);
					nomarkers[i$1].firstChild.replaceWith(...parts);
				}
			}
		}
		templates[0].create = code;
		cache.set(statics, templates);
		return templates;
	}
	function parseKeyValue(node, tag, name, value, isSVG, isCE, options) {
		let expr = value === "###" ? `!doNotWrap ? exprs[${options.counter}]() : exprs[${options.counter++}]` : value.split("###").map((v, i) => i ? ` + (typeof exprs[${options.counter}] === "function" ? exprs[${options.counter}]() : exprs[${options.counter++}]) + "${v}"` : `"${v}"`).join("");
		let parts;
		let namespace;
		if ((parts = name.split(":")) && parts[1] && reservedNameSpaces.has(parts[0])) {
			name = parts[1];
			namespace = parts[0];
		}
		const isChildProp = r.ChildProperties.has(name);
		const isProp = r.Properties.has(name);
		if (name === "style") {
			const prev = `_$v${uuid++}`;
			options.decl.push(`${prev}={}`);
			options.exprs.push(`r.style(${tag},${expr},${prev})`);
		} else if (name === "classList") {
			const prev = `_$v${uuid++}`;
			options.decl.push(`${prev}={}`);
			options.exprs.push(`r.classList(${tag},${expr},${prev})`);
		} else if (namespace !== "attr" && (isChildProp || !isSVG && (r.getPropAlias(name, node.name.toUpperCase()) || isProp) || isCE || namespace === "prop")) {
			if (isCE && !isChildProp && !isProp && namespace !== "prop") name = toPropertyName(name);
			options.exprs.push(`${tag}.${r.getPropAlias(name, node.name.toUpperCase()) || name} = ${expr}`);
		} else {
			const ns = isSVG && name.indexOf(":") > -1 && r.SVGNamespace[name.split(":")[0]];
			if (ns) options.exprs.push(`r.setAttributeNS(${tag},"${ns}","${name}",${expr})`);
			else options.exprs.push(`r.setAttribute(${tag},"${r.Aliases[name] || name}",${expr})`);
		}
	}
	function parseAttribute(node, tag, name, value, isSVG, isCE, options) {
		if (name.slice(0, 2) === "on") if (!name.includes(":")) {
			const lc = name.slice(2).toLowerCase();
			const delegate = delegateEvents$1 && r.DelegatedEvents.has(lc);
			options.exprs.push(`r.addEventListener(${tag},"${lc}",exprs[${options.counter++}],${delegate})`);
			delegate && options.delegatedEvents.add(lc);
		} else {
			let capture = name.startsWith("oncapture:");
			options.exprs.push(`${tag}.addEventListener("${name.slice(capture ? 10 : 3)}",exprs[${options.counter++}]${capture ? ",true" : ""})`);
		}
		else if (name === "ref") options.exprs.push(`exprs[${options.counter++}](${tag})`);
		else {
			const childOptions = Object.assign({}, options, { exprs: [] });
			const count = options.counter;
			parseKeyValue(node, tag, name, value, isSVG, isCE, childOptions);
			options.decl.push(`_fn${count} = (${value === "###" ? "doNotWrap" : ""}) => {\n${childOptions.exprs.join(";\n")};\n}`);
			if (value === "###") options.exprs.push(`typeof exprs[${count}] === "function" ? r.effect(_fn${count}) : _fn${count}(true)`);
			else {
				let check = "";
				for (let i = count; i < childOptions.counter; i++) {
					i !== count && (check += " || ");
					check += `typeof exprs[${i}] === "function"`;
				}
				options.exprs.push(check + ` ? r.effect(_fn${count}) : _fn${count}()`);
			}
			options.counter = childOptions.counter;
			options.wrap = false;
		}
	}
	function processChildren(node, options) {
		const childOptions = Object.assign({}, options, {
			first: true,
			multi: false,
			parent: options.path
		});
		if (node.children.length > 1) for (let i$1 = 0; i$1 < node.children.length; i$1++) {
			const child = node.children[i$1];
			if (child.type === "comment" && child.content === "#" || child.type === "tag" && child.name === "###") {
				childOptions.multi = true;
				break;
			}
		}
		let i = 0;
		while (i < node.children.length) {
			const child = node.children[i];
			if (child.name === "###") {
				if (childOptions.multi) {
					node.children[i] = {
						type: "comment",
						content: "#"
					};
					i++;
				} else node.children.splice(i, 1);
				processComponent(child, childOptions);
				continue;
			}
			parseNode(child, childOptions);
			if (!childOptions.multi && child.type === "comment" && child.content === "#") node.children.splice(i, 1);
			else i++;
		}
		options.counter = childOptions.counter;
		options.templateId = childOptions.templateId;
		options.hasCustomElement = options.hasCustomElement || childOptions.hasCustomElement;
		options.isImportNode = options.isImportNode || childOptions.isImportNode;
	}
	function processComponentProps(propGroups) {
		let result = [];
		for (const props of propGroups) if (Array.isArray(props)) {
			if (!props.length) continue;
			result.push(`r.wrapProps({${props.join(",") || ""}})`);
		} else result.push(props);
		return result.length > 1 ? `r.mergeProps(${result.join(",")})` : result[0];
	}
	function processComponent(node, options) {
		let props = [];
		const keys = Object.keys(node.attrs);
		const propGroups = [props];
		const componentIdentifier = options.counter++;
		for (let i = 0; i < keys.length; i++) {
			const { type, name, value } = node.attrs[i];
			if (type === "attr") if (name === "###") {
				propGroups.push(`exprs[${options.counter++}]`);
				propGroups.push(props = []);
			} else if (value === "###") props.push(`${name}: exprs[${options.counter++}]`);
			else props.push(`${name}: "${value}"`);
			else if (type === "directive") {
				const tag$1 = `_$el${uuid++}`;
				const topDecl = !options.decl.length;
				options.decl.push(topDecl ? "" : `${tag$1} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
				parseDirective(name, value, tag$1, options);
			}
		}
		if (node.children.length === 1 && node.children[0].type === "comment" && node.children[0].content === "#") props.push(`children: () => exprs[${options.counter++}]`);
		else if (node.children.length) {
			const children$1 = {
				type: "fragment",
				children: node.children
			};
			const childOptions = Object.assign({}, options, {
				first: true,
				decl: [],
				exprs: [],
				parent: false
			});
			parseNode(children$1, childOptions);
			props.push(`children: () => { ${childOptions.exprs.join(";\n")}}`);
			options.templateId = childOptions.templateId;
			options.counter = childOptions.counter;
		}
		let tag;
		if (options.multi) {
			tag = `_$el${uuid++}`;
			options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
		}
		if (options.parent) options.exprs.push(`r.insert(${options.parent}, r.createComponent(exprs[${componentIdentifier}],${processComponentProps(propGroups)})${tag ? `, ${tag}` : ""})`);
		else options.exprs.push(`${options.fragment ? "" : "return "}r.createComponent(exprs[${componentIdentifier}],${processComponentProps(propGroups)})`);
		options.path = tag;
		options.first = false;
	}
	function parseNode(node, options) {
		if (node.type === "fragment") {
			const parts = [];
			node.children.forEach((child) => {
				if (child.type === "tag") {
					if (child.name === "###") {
						const childOptions$1 = Object.assign({}, options, {
							first: true,
							fragment: true,
							decl: [],
							exprs: []
						});
						processComponent(child, childOptions$1);
						parts.push(childOptions$1.exprs[0]);
						options.counter = childOptions$1.counter;
						options.templateId = childOptions$1.templateId;
						return;
					}
					options.templateId++;
					const id = uuid;
					const childOptions = Object.assign({}, options, {
						first: true,
						decl: [],
						exprs: []
					});
					options.templateNodes.push([child]);
					parseNode(child, childOptions);
					parts.push(`function() { ${childOptions.decl.join(",\n") + ";\n" + childOptions.exprs.join(";\n") + `;\nreturn _$el${id};\n`}}()`);
					options.counter = childOptions.counter;
					options.templateId = childOptions.templateId;
				} else if (child.type === "text") parts.push(`"${child.content}"`);
				else if (child.type === "comment") {
					if (child.content === "#") parts.push(`exprs[${options.counter++}]`);
					else if (child.content) for (let i = 0; i < child.content.split("###").length - 1; i++) parts.push(`exprs[${options.counter++}]`);
				}
			});
			options.exprs.push(`return [${parts.join(", \n")}]`);
		} else if (node.type === "tag") {
			const tag = `_$el${uuid++}`;
			const topDecl = !options.decl.length;
			const templateId = options.templateId;
			options.decl.push(topDecl ? "" : `${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
			const isSVG = r.SVGElements.has(node.name);
			const isCE = node.name.includes("-") || node.attrs.some((e) => e.name === "is");
			options.hasCustomElement = isCE;
			options.isImportNode = (node.name === "img" || node.name === "iframe") && node.attrs.some((e) => e.name === "loading" && e.value === "lazy");
			if (node.attrs.some((e) => e.name === "###")) {
				const spreadArgs = [];
				let current = "";
				const newAttrs = [];
				for (let i = 0; i < node.attrs.length; i++) {
					const { type, name, value } = node.attrs[i];
					if (type === "attr") if (value.includes("###")) {
						let count = options.counter++;
						current += `${name}: ${name !== "ref" ? `typeof exprs[${count}] === "function" ? exprs[${count}]() : ` : ""}exprs[${count}],`;
					} else if (name === "###") {
						if (current.length) {
							spreadArgs.push(`()=>({${current}})`);
							current = "";
						}
						spreadArgs.push(`exprs[${options.counter++}]`);
					} else newAttrs.push(node.attrs[i]);
					else if (type === "directive") parseDirective(name, value, tag, options);
				}
				node.attrs = newAttrs;
				if (current.length) spreadArgs.push(`()=>({${current}})`);
				options.exprs.push(`r.spread(${tag},${spreadArgs.length === 1 ? `typeof ${spreadArgs[0]} === "function" ? r.mergeProps(${spreadArgs[0]}) : ${spreadArgs[0]}` : `r.mergeProps(${spreadArgs.join(",")})`},${isSVG},${!!node.children.length})`);
			} else for (let i = 0; i < node.attrs.length; i++) {
				const { type, name, value } = node.attrs[i];
				if (type === "directive") {
					parseDirective(name, value, tag, options);
					node.attrs.splice(i, 1);
					i--;
				} else if (type === "attr") {
					if (value.includes("###")) {
						node.attrs.splice(i, 1);
						i--;
						parseAttribute(node, tag, name, value, isSVG, isCE, options);
					}
				}
			}
			options.path = tag;
			options.first = false;
			processChildren(node, options);
			if (topDecl) options.decl[0] = options.hasCustomElement || options.isImportNode ? `const ${tag} = r.untrack(() => document.importNode(tmpls[${templateId}].content.firstChild, true))` : `const ${tag} = tmpls[${templateId}].content.firstChild.cloneNode(true)`;
		} else if (node.type === "text") {
			const tag = `_$el${uuid++}`;
			options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
			options.path = tag;
			options.first = false;
		} else if (node.type === "comment") {
			const tag = `_$el${uuid++}`;
			options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
			if (node.content === "#") if (options.multi) options.exprs.push(`r.insert(${options.parent}, exprs[${options.counter++}], ${tag})`);
			else options.exprs.push(`r.insert(${options.parent}, exprs[${options.counter++}])`);
			options.path = tag;
			options.first = false;
		}
	}
	function parseTemplate(nodes, funcBuilder) {
		const options = {
			path: "",
			decl: [],
			exprs: [],
			delegatedEvents: new Set(),
			counter: 0,
			first: true,
			multi: false,
			templateId: 0,
			templateNodes: []
		};
		const id = uuid;
		const origNodes = nodes;
		let toplevel;
		if (nodes.length > 1) nodes = [{
			type: "fragment",
			children: nodes
		}];
		if (nodes[0].name === "###") {
			toplevel = true;
			processComponent(nodes[0], options);
		} else parseNode(nodes[0], options);
		r.delegateEvents(Array.from(options.delegatedEvents));
		const templateNodes = [origNodes].concat(options.templateNodes);
		return [templateNodes.map((t) => stringify(t)), funcBuilder("tmpls", "exprs", "r", options.decl.join(",\n") + ";\n" + options.exprs.join(";\n") + (toplevel ? "" : `;\nreturn _$el${id};\n`))];
	}
	function html$1(statics, ...args) {
		const templates = cache.get(statics) || createTemplate(statics, { funcBuilder: functionBuilder });
		return templates[0].create(templates, args, r);
	}
	__name(html$1, "html");
	return html$1;
}
const html = createHTML({
	effect: createRenderEffect,
	style,
	insert,
	untrack,
	spread,
	createComponent,
	delegateEvents,
	classList,
	mergeProps,
	dynamicProperty,
	setAttribute,
	setAttributeNS,
	addEventListener,
	Aliases,
	getPropAlias,
	Properties,
	ChildProperties,
	DelegatedEvents,
	SVGElements,
	SVGNamespace
});

//#endregion
//#region node_modules/@solidjs/router/dist/index.js
function createBeforeLeave() {
	let listeners = new Set();
	function subscribe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}
	let ignore = false;
	function confirm(to, options) {
		if (ignore) return !(ignore = false);
		const e = {
			to,
			options,
			defaultPrevented: false,
			preventDefault: () => e.defaultPrevented = true
		};
		for (const l of listeners) l.listener({
			...e,
			from: l.location,
			retry: (force) => {
				force && (ignore = true);
				l.navigate(to, {
					...options,
					resolve: false
				});
			}
		});
		return !e.defaultPrevented;
	}
	return {
		subscribe,
		confirm
	};
}
let depth;
function saveCurrentDepth() {
	if (!window.history.state || window.history.state._depth == null) window.history.replaceState({
		...window.history.state,
		_depth: window.history.length - 1
	}, "");
	depth = window.history.state._depth;
}
if (!isServer) saveCurrentDepth();
function keepDepth(state) {
	return {
		...state,
		_depth: window.history.state && window.history.state._depth
	};
}
function notifyIfNotBlocked(notify, block) {
	let ignore = false;
	return () => {
		const prevDepth = depth;
		saveCurrentDepth();
		const delta = prevDepth == null ? null : depth - prevDepth;
		if (ignore) {
			ignore = false;
			return;
		}
		if (delta && block(delta)) {
			ignore = true;
			window.history.go(-delta);
		} else notify();
	};
}
const hasSchemeRegex = /^(?:[a-z0-9]+:)?\/\//i;
const trimPathRegex = /^\/+|(\/)\/+$/g;
const mockBase = "http://sr";
function normalizePath(path, omitSlash = false) {
	const s = path.replace(trimPathRegex, "$1");
	return s ? omitSlash || /^[?#]/.test(s) ? s : "/" + s : "";
}
function resolvePath(base, path, from) {
	if (hasSchemeRegex.test(path)) return void 0;
	const basePath = normalizePath(base);
	const fromPath = from && normalizePath(from);
	let result = "";
	if (!fromPath || path.startsWith("/")) result = basePath;
	else if (fromPath.toLowerCase().indexOf(basePath.toLowerCase()) !== 0) result = basePath + fromPath;
	else result = fromPath;
	return (result || "/") + normalizePath(path, !result);
}
function invariant(value, message) {
	if (value == null) throw new Error(message);
	return value;
}
function joinPaths(from, to) {
	return normalizePath(from).replace(/\/*(\*.*)?$/g, "") + normalizePath(to);
}
function extractSearchParams(url) {
	const params = {};
	url.searchParams.forEach((value, key) => {
		if (key in params) if (Array.isArray(params[key])) params[key].push(value);
		else params[key] = [params[key], value];
		else params[key] = value;
	});
	return params;
}
function createMatcher(path, partial, matchFilters) {
	const [pattern, splat] = path.split("/*", 2);
	const segments = pattern.split("/").filter(Boolean);
	const len = segments.length;
	return (location) => {
		const locSegments = location.split("/").filter(Boolean);
		const lenDiff = locSegments.length - len;
		if (lenDiff < 0 || lenDiff > 0 && splat === void 0 && !partial) return null;
		const match = {
			path: len ? "" : "/",
			params: {}
		};
		const matchFilter = (s) => matchFilters === void 0 ? void 0 : matchFilters[s];
		for (let i = 0; i < len; i++) {
			const segment = segments[i];
			const dynamic = segment[0] === ":";
			const locSegment = dynamic ? locSegments[i] : locSegments[i].toLowerCase();
			const key = dynamic ? segment.slice(1) : segment.toLowerCase();
			if (dynamic && matchSegment(locSegment, matchFilter(key))) match.params[key] = locSegment;
			else if (dynamic || !matchSegment(locSegment, key)) return null;
			match.path += `/${locSegment}`;
		}
		if (splat) {
			const remainder = lenDiff ? locSegments.slice(-lenDiff).join("/") : "";
			if (matchSegment(remainder, matchFilter(splat))) match.params[splat] = remainder;
			else return null;
		}
		return match;
	};
}
function matchSegment(input, filter) {
	const isEqual = (s) => s === input;
	if (filter === void 0) return true;
	else if (typeof filter === "string") return isEqual(filter);
	else if (typeof filter === "function") return filter(input);
	else if (Array.isArray(filter)) return filter.some(isEqual);
	else if (filter instanceof RegExp) return filter.test(input);
	return false;
}
function scoreRoute(route) {
	const [pattern, splat] = route.pattern.split("/*", 2);
	const segments = pattern.split("/").filter(Boolean);
	return segments.reduce((score, segment) => score + (segment.startsWith(":") ? 2 : 3), segments.length - (splat === void 0 ? 0 : 1));
}
function createMemoObject(fn) {
	const map = new Map();
	const owner = getOwner();
	return new Proxy({}, {
		get(_, property) {
			if (!map.has(property)) runWithOwner(owner, () => map.set(property, createMemo(() => fn()[property])));
			return map.get(property)();
		},
		getOwnPropertyDescriptor() {
			return {
				enumerable: true,
				configurable: true
			};
		},
		ownKeys() {
			return Reflect.ownKeys(fn());
		}
	});
}
function expandOptionals(pattern) {
	let match = /(\/?\:[^\/]+)\?/.exec(pattern);
	if (!match) return [pattern];
	let prefix = pattern.slice(0, match.index);
	let suffix = pattern.slice(match.index + match[0].length);
	const prefixes = [prefix, prefix += match[1]];
	while (match = /^(\/\:[^\/]+)\?/.exec(suffix)) {
		prefixes.push(prefix += match[1]);
		suffix = suffix.slice(match[0].length);
	}
	return expandOptionals(suffix).reduce((results, expansion) => [...results, ...prefixes.map((p) => p + expansion)], []);
}
const MAX_REDIRECTS = 100;
const RouterContextObj = createContext();
const RouteContextObj = createContext();
const useRouter = () => invariant(useContext(RouterContextObj), "<A> and 'use' router primitives can be only used inside a Route.");
/**
* Retrieves method to do navigation. The method accepts a path to navigate to and an optional object with the following options:
* 
* - resolve (*boolean*, default `true`): resolve the path against the current route
* - replace (*boolean*, default `false`): replace the history entry
* - scroll (*boolean*, default `true`): scroll to top after navigation
* - state (*any*, default `undefined`): pass custom state to `location.state`
* 
* **Note**: The state is serialized using the structured clone algorithm which does not support all object types.
* 
* @example
* ```js
* const navigate = useNavigate();
* 
* if (unauthorized) {
*   navigate("/login", { replace: true });
* }
* ```
*/
const useNavigate = () => useRouter().navigatorFactory();
/**
* Retrieves reactive `location` object useful for getting things like `pathname`.
* 
* @example
* ```js
* const location = useLocation();
* 
* const pathname = createMemo(() => parsePath(location.pathname));
* ```
*/
const useLocation = () => useRouter().location;
/**
* Retrieves a reactive, store-like object containing the current route path parameters as defined in the Route.
* 
* @example
* ```js
* const params = useParams();
* 
* // fetch user based on the id path parameter
* const [user] = createResource(() => params.id, fetchUser);
* ```
*/
const useParams = () => useRouter().params;
function createRoutes(routeDef, base = "") {
	const { component, preload, load, children: children$1, info } = routeDef;
	const isLeaf = !children$1 || Array.isArray(children$1) && !children$1.length;
	const shared = {
		key: routeDef,
		component,
		preload: preload || load,
		info
	};
	return asArray(routeDef.path).reduce((acc, originalPath) => {
		for (const expandedPath of expandOptionals(originalPath)) {
			const path = joinPaths(base, expandedPath);
			let pattern = isLeaf ? path : path.split("/*", 1)[0];
			pattern = pattern.split("/").map((s) => {
				return s.startsWith(":") || s.startsWith("*") ? s : encodeURIComponent(s);
			}).join("/");
			acc.push({
				...shared,
				originalPath,
				pattern,
				matcher: createMatcher(pattern, !isLeaf, routeDef.matchFilters)
			});
		}
		return acc;
	}, []);
}
function createBranch(routes, index = 0) {
	return {
		routes,
		score: scoreRoute(routes[routes.length - 1]) * 1e4 - index,
		matcher(location) {
			const matches = [];
			for (let i = routes.length - 1; i >= 0; i--) {
				const route = routes[i];
				const match = route.matcher(location);
				if (!match) return null;
				matches.unshift({
					...match,
					route
				});
			}
			return matches;
		}
	};
}
function asArray(value) {
	return Array.isArray(value) ? value : [value];
}
function createBranches(routeDef, base = "", stack = [], branches = []) {
	const routeDefs = asArray(routeDef);
	for (let i = 0, len = routeDefs.length; i < len; i++) {
		const def = routeDefs[i];
		if (def && typeof def === "object") {
			if (!def.hasOwnProperty("path")) def.path = "";
			const routes = createRoutes(def, base);
			for (const route of routes) {
				stack.push(route);
				const isEmptyArray = Array.isArray(def.children) && def.children.length === 0;
				if (def.children && !isEmptyArray) createBranches(def.children, route.pattern, stack, branches);
				else {
					const branch = createBranch([...stack], branches.length);
					branches.push(branch);
				}
				stack.pop();
			}
		}
	}
	return stack.length ? branches : branches.sort((a, b) => b.score - a.score);
}
function getRouteMatches(branches, location) {
	for (let i = 0, len = branches.length; i < len; i++) {
		const match = branches[i].matcher(location);
		if (match) return match;
	}
	return [];
}
function createLocation(path, state, queryWrapper) {
	const origin = new URL(mockBase);
	const url = createMemo((prev) => {
		const path_ = path();
		try {
			return new URL(path_, origin);
		} catch (err) {
			console.error(`Invalid path ${path_}`);
			return prev;
		}
	}, origin, { equals: (a, b) => a.href === b.href });
	const pathname = createMemo(() => url().pathname);
	const search = createMemo(() => url().search, true);
	const hash = createMemo(() => url().hash);
	const key = () => "";
	const queryFn = on(search, () => extractSearchParams(url()));
	return {
		get pathname() {
			return pathname();
		},
		get search() {
			return search();
		},
		get hash() {
			return hash();
		},
		get state() {
			return state();
		},
		get key() {
			return key();
		},
		query: queryWrapper ? queryWrapper(queryFn) : createMemoObject(queryFn)
	};
}
let intent;
function getIntent() {
	return intent;
}
let inPreloadFn = false;
function getInPreloadFn() {
	return inPreloadFn;
}
function setInPreloadFn(value) {
	inPreloadFn = value;
}
function createRouterContext(integration, branches, getContext, options = {}) {
	const { signal: [source, setSource], utils = {} } = integration;
	const parsePath = utils.parsePath || ((p) => p);
	const renderPath = utils.renderPath || ((p) => p);
	const beforeLeave = utils.beforeLeave || createBeforeLeave();
	const basePath = resolvePath("", options.base || "");
	if (basePath === void 0) throw new Error(`${basePath} is not a valid base path`);
	else if (basePath && !source().value) setSource({
		value: basePath,
		replace: true,
		scroll: false
	});
	const [isRouting, setIsRouting] = createSignal(false);
	let lastTransitionTarget;
	const transition = (newIntent, newTarget) => {
		if (newTarget.value === reference() && newTarget.state === state()) return;
		if (lastTransitionTarget === void 0) setIsRouting(true);
		intent = newIntent;
		lastTransitionTarget = newTarget;
		startTransition(() => {
			if (lastTransitionTarget !== newTarget) return;
			setReference(lastTransitionTarget.value);
			setState(lastTransitionTarget.state);
			resetErrorBoundaries();
			if (!isServer) submissions[1]((subs) => subs.filter((s) => s.pending));
		}).finally(() => {
			if (lastTransitionTarget !== newTarget) return;
			batch(() => {
				intent = void 0;
				if (newIntent === "navigate") navigateEnd(lastTransitionTarget);
				setIsRouting(false);
				lastTransitionTarget = void 0;
			});
		});
	};
	const [reference, setReference] = createSignal(source().value);
	const [state, setState] = createSignal(source().state);
	const location = createLocation(reference, state, utils.queryWrapper);
	const referrers = [];
	const submissions = createSignal(isServer ? initFromFlash() : []);
	const matches = createMemo(() => {
		if (typeof options.transformUrl === "function") return getRouteMatches(branches(), options.transformUrl(location.pathname));
		return getRouteMatches(branches(), location.pathname);
	});
	const buildParams = () => {
		const m = matches();
		const params$1 = {};
		for (let i = 0; i < m.length; i++) Object.assign(params$1, m[i].params);
		return params$1;
	};
	const params = utils.paramsWrapper ? utils.paramsWrapper(buildParams, branches) : createMemoObject(buildParams);
	const baseRoute = {
		pattern: basePath,
		path: () => basePath,
		outlet: () => null,
		resolvePath(to) {
			return resolvePath(basePath, to);
		}
	};
	createRenderEffect(on(source, (source$1) => transition("native", source$1), { defer: true }));
	return {
		base: baseRoute,
		location,
		params,
		isRouting,
		renderPath,
		parsePath,
		navigatorFactory,
		matches,
		beforeLeave,
		preloadRoute,
		singleFlight: options.singleFlight === void 0 ? true : options.singleFlight,
		submissions
	};
	function navigateFromRoute(route, to, options$1) {
		untrack(() => {
			if (typeof to === "number") {
				if (!to);
				else if (utils.go) utils.go(to);
				else console.warn("Router integration does not support relative routing");
				return;
			}
			const queryOnly = !to || to[0] === "?";
			const { replace, resolve, scroll, state: nextState } = {
				replace: false,
				resolve: !queryOnly,
				scroll: true,
				...options$1
			};
			const resolvedTo = resolve ? route.resolvePath(to) : resolvePath(queryOnly && location.pathname || "", to);
			if (resolvedTo === void 0) throw new Error(`Path '${to}' is not a routable path`);
			else if (referrers.length >= MAX_REDIRECTS) throw new Error("Too many redirects");
			const current = reference();
			if (resolvedTo !== current || nextState !== state()) {
				if (isServer) {
					const e = voidFn();
					e && (e.response = {
						status: 302,
						headers: new Headers({ Location: resolvedTo })
					});
					setSource({
						value: resolvedTo,
						replace,
						scroll,
						state: nextState
					});
				} else if (beforeLeave.confirm(resolvedTo, options$1)) {
					referrers.push({
						value: current,
						replace,
						scroll,
						state: state()
					});
					transition("navigate", {
						value: resolvedTo,
						state: nextState
					});
				}
			}
		});
	}
	function navigatorFactory(route) {
		route = route || useContext(RouteContextObj) || baseRoute;
		return (to, options$1) => navigateFromRoute(route, to, options$1);
	}
	function navigateEnd(next) {
		const first = referrers[0];
		if (first) {
			setSource({
				...next,
				replace: first.replace,
				scroll: first.scroll
			});
			referrers.length = 0;
		}
	}
	function preloadRoute(url, preloadData) {
		const matches$1 = getRouteMatches(branches(), url.pathname);
		const prevIntent = intent;
		intent = "preload";
		for (let match in matches$1) {
			const { route, params: params$1 } = matches$1[match];
			route.component && route.component.preload && route.component.preload();
			const { preload } = route;
			inPreloadFn = true;
			preloadData && preload && runWithOwner(getContext(), () => preload({
				params: params$1,
				location: {
					pathname: url.pathname,
					search: url.search,
					hash: url.hash,
					query: extractSearchParams(url),
					state: null,
					key: ""
				},
				intent: "preload"
			}));
			inPreloadFn = false;
		}
		intent = prevIntent;
	}
	function initFromFlash() {
		const e = voidFn();
		return e && e.router && e.router.submission ? [e.router.submission] : [];
	}
}
function createRouteContext(router, parent, outlet, match) {
	const { base, location, params } = router;
	const { pattern, component, preload } = match().route;
	const path = createMemo(() => match().path);
	component && component.preload && component.preload();
	inPreloadFn = true;
	const data = preload ? preload({
		params,
		location,
		intent: intent || "initial"
	}) : void 0;
	inPreloadFn = false;
	const route = {
		parent,
		pattern,
		path,
		outlet: () => component ? createComponent(component, {
			params,
			location,
			data,
			get children() {
				return outlet();
			}
		}) : outlet(),
		resolvePath(to) {
			return resolvePath(base.path(), to, path());
		}
	};
	return route;
}
const createRouterComponent = (router) => (props) => {
	const { base } = props;
	const routeDefs = children(() => props.children);
	const branches = createMemo(() => createBranches(routeDefs(), props.base || ""));
	let context;
	const routerState = createRouterContext(router, branches, () => context, {
		base,
		singleFlight: props.singleFlight,
		transformUrl: props.transformUrl
	});
	router.create && router.create(routerState);
	return createComponent(RouterContextObj.Provider, {
		value: routerState,
		get children() {
			return createComponent(Root, {
				routerState,
				get root() {
					return props.root;
				},
				get preload() {
					return props.rootPreload || props.rootLoad;
				},
				get children() {
					return [createMemo(() => (context = getOwner()) && null), createComponent(Routes, {
						routerState,
						get branches() {
							return branches();
						}
					})];
				}
			});
		}
	});
};
function Root(props) {
	const location = props.routerState.location;
	const params = props.routerState.params;
	const data = createMemo(() => props.preload && untrack(() => {
		setInPreloadFn(true);
		props.preload({
			params,
			location,
			intent: getIntent() || "initial"
		});
		setInPreloadFn(false);
	}));
	return createComponent(Show, {
		get when() {
			return props.root;
		},
		keyed: true,
		get fallback() {
			return props.children;
		},
		children: (Root$1) => createComponent(Root$1, {
			params,
			location,
			get data() {
				return data();
			},
			get children() {
				return props.children;
			}
		})
	});
}
function Routes(props) {
	if (isServer) {
		const e = voidFn();
		if (e && e.router && e.router.dataOnly) {
			dataOnly(e, props.routerState, props.branches);
			return;
		}
		e && ((e.router || (e.router = {})).matches || (e.router.matches = props.routerState.matches().map(({ route, path, params }) => ({
			path: route.originalPath,
			pattern: route.pattern,
			match: path,
			params,
			info: route.info
		}))));
	}
	const disposers = [];
	let root;
	const routeStates = createMemo(on(props.routerState.matches, (nextMatches, prevMatches, prev) => {
		let equal = prevMatches && nextMatches.length === prevMatches.length;
		const next = [];
		for (let i = 0, len = nextMatches.length; i < len; i++) {
			const prevMatch = prevMatches && prevMatches[i];
			const nextMatch = nextMatches[i];
			if (prev && prevMatch && nextMatch.route.key === prevMatch.route.key) next[i] = prev[i];
			else {
				equal = false;
				if (disposers[i]) disposers[i]();
				createRoot((dispose) => {
					disposers[i] = dispose;
					next[i] = createRouteContext(props.routerState, next[i - 1] || props.routerState.base, createOutlet(() => routeStates()[i + 1]), () => props.routerState.matches()[i]);
				});
			}
		}
		disposers.splice(nextMatches.length).forEach((dispose) => dispose());
		if (prev && equal) return prev;
		root = next[0];
		return next;
	}));
	return createOutlet(() => routeStates() && root)();
}
const createOutlet = (child) => {
	return () => createComponent(Show, {
		get when() {
			return child();
		},
		keyed: true,
		children: (child$1) => createComponent(RouteContextObj.Provider, {
			value: child$1,
			get children() {
				return child$1.outlet();
			}
		})
	});
};
const Route = (props) => {
	const childRoutes = children(() => props.children);
	return mergeProps(props, { get children() {
		return childRoutes();
	} });
};
function dataOnly(event, routerState, branches) {
	const url = new URL(event.request.url);
	const prevMatches = getRouteMatches(branches, new URL(event.router.previousUrl || event.request.url).pathname);
	const matches = getRouteMatches(branches, url.pathname);
	for (let match = 0; match < matches.length; match++) {
		if (!prevMatches[match] || matches[match].route !== prevMatches[match].route) event.router.dataOnly = true;
		const { route, params } = matches[match];
		route.preload && route.preload({
			params,
			location: routerState.location,
			intent: "preload"
		});
	}
}
function intercept([value, setValue], get, set) {
	return [value, set ? (v) => setValue(set(v)) : setValue];
}
function createRouter(config) {
	let ignore = false;
	const wrap = (value) => typeof value === "string" ? { value } : value;
	const signal = intercept(createSignal(wrap(config.get()), { equals: (a, b) => a.value === b.value && a.state === b.state }), void 0, (next) => {
		!ignore && config.set(next);
		if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = true;
		return next;
	});
	config.init && onCleanup(config.init((value = config.get()) => {
		ignore = true;
		signal[1](wrap(value));
		ignore = false;
	}));
	return createRouterComponent({
		signal,
		create: config.create,
		utils: config.utils
	});
}
function bindEvent(target, type, handler) {
	target.addEventListener(type, handler);
	return () => target.removeEventListener(type, handler);
}
function scrollToHash(hash, fallbackTop) {
	const el = hash && document.getElementById(hash);
	if (el) el.scrollIntoView();
	else if (fallbackTop) window.scrollTo(0, 0);
}
function getPath(url) {
	const u = new URL(url);
	return u.pathname + u.search;
}
function StaticRouter(props) {
	let e;
	const obj = { value: props.url || (e = voidFn()) && getPath(e.request.url) || "" };
	return createRouterComponent({ signal: [() => obj, (next) => Object.assign(obj, next)] })(props);
}
const LocationHeader = "Location";
const PRELOAD_TIMEOUT = 5e3;
const CACHE_TIMEOUT = 18e4;
let cacheMap = new Map();
if (!isServer) setInterval(() => {
	const now = Date.now();
	for (let [k, v] of cacheMap.entries()) if (!v[4].count && now - v[0] > CACHE_TIMEOUT) cacheMap.delete(k);
}, 3e5);
function getCache() {
	if (!isServer) return cacheMap;
	const req = voidFn();
	if (!req) throw new Error("Cannot find cache context");
	return (req.router || (req.router = {})).cache || (req.router.cache = new Map());
}
function query(fn, name) {
	if (fn.GET) fn = fn.GET;
	const cachedFn = (...args) => {
		const cache$1 = getCache();
		const intent$1 = getIntent();
		const inPreloadFn$1 = getInPreloadFn();
		const owner = getOwner();
		const navigate = owner ? useNavigate() : void 0;
		const now = Date.now();
		const key = name + hashKey(args);
		let cached = cache$1.get(key);
		let tracking;
		if (isServer) {
			const e = voidFn();
			if (e) {
				const dataOnly$1 = (e.router || (e.router = {})).dataOnly;
				if (dataOnly$1) {
					const data = e && (e.router.data || (e.router.data = {}));
					if (data && key in data) return data[key];
					if (Array.isArray(dataOnly$1) && !matchKey(key, dataOnly$1)) {
						data[key] = void 0;
						return Promise.resolve();
					}
				}
			}
		}
		if (getListener() && !isServer) {
			tracking = true;
			onCleanup(() => cached[4].count--);
		}
		if (cached && cached[0] && (isServer || intent$1 === "native" || cached[4].count || Date.now() - cached[0] < PRELOAD_TIMEOUT)) {
			if (tracking) {
				cached[4].count++;
				cached[4][0]();
			}
			if (cached[3] === "preload" && intent$1 !== "preload") cached[0] = now;
			let res$1 = cached[1];
			if (intent$1 !== "preload") {
				res$1 = "then" in cached[1] ? cached[1].then(handleResponse(false), handleResponse(true)) : handleResponse(false)(cached[1]);
				!isServer && intent$1 === "navigate" && startTransition(() => cached[4][1](cached[0]));
			}
			inPreloadFn$1 && "then" in res$1 && res$1.catch(() => {});
			return res$1;
		}
		let res;
		if (!isServer && sharedConfig.has && sharedConfig.has(key)) {
			res = sharedConfig.load(key);
			delete globalThis._$HY.r[key];
		} else res = fn(...args);
		if (cached) {
			cached[0] = now;
			cached[1] = res;
			cached[3] = intent$1;
			!isServer && intent$1 === "navigate" && startTransition(() => cached[4][1](cached[0]));
		} else {
			cache$1.set(key, cached = [
				now,
				res,
				,
				intent$1,
				createSignal(now)
			]);
			cached[4].count = 0;
		}
		if (tracking) {
			cached[4].count++;
			cached[4][0]();
		}
		if (isServer) {
			const e = voidFn();
			if (e && e.router.dataOnly) return e.router.data[key] = res;
		}
		if (intent$1 !== "preload") res = "then" in res ? res.then(handleResponse(false), handleResponse(true)) : handleResponse(false)(res);
		inPreloadFn$1 && "then" in res && res.catch(() => {});
		if (isServer && sharedConfig.context && sharedConfig.context.async && !sharedConfig.context.noHydrate) {
			const e = voidFn();
			(!e || !e.serverOnly) && sharedConfig.context.serialize(key, res);
		}
		return res;
		function handleResponse(error) {
			return async (v) => {
				if (v instanceof Response) {
					const url = v.headers.get(LocationHeader);
					if (url !== null) {
						if (navigate && url.startsWith("/")) startTransition(() => {
							navigate(url, { replace: true });
						});
						else if (!isServer) window.location.href = url;
						else if (isServer) {
							const e = voidFn();
							if (e) e.response = {
								status: 302,
								headers: new Headers({ Location: url })
							};
						}
						return;
					}
					if (v.customBody) v = await v.customBody();
				}
				if (error) throw v;
				cached[2] = v;
				return v;
			};
		}
	};
	cachedFn.keyFor = (...args) => name + hashKey(args);
	cachedFn.key = name;
	return cachedFn;
}
query.get = (key) => {
	const cached = getCache().get(key);
	return cached[2];
};
query.set = (key, value) => {
	const cache$1 = getCache();
	const now = Date.now();
	let cached = cache$1.get(key);
	if (cached) {
		cached[0] = now;
		cached[1] = Promise.resolve(value);
		cached[2] = value;
		cached[3] = "preload";
	} else {
		cache$1.set(key, cached = [
			now,
			Promise.resolve(value),
			value,
			"preload",
			createSignal(now)
		]);
		cached[4].count = 0;
	}
};
query.delete = (key) => getCache().delete(key);
query.clear = () => getCache().clear();
function matchKey(key, keys) {
	for (let k of keys) if (k && key.startsWith(k)) return true;
	return false;
}
function hashKey(args) {
	return JSON.stringify(args, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
		result[key] = val[key];
		return result;
	}, {}) : val);
}
function isPlainObject(obj) {
	let proto;
	return obj != null && typeof obj === "object" && (!(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype);
}
const actions = /* @__PURE__ */ new Map();
function setupNativeEvents(preload = true, explicitLinks = false, actionBase = "/_server", transformUrl) {
	return (router) => {
		const basePath = router.base.path();
		const navigateFromRoute = router.navigatorFactory(router.base);
		let preloadTimeout;
		let lastElement;
		function isSvg(el) {
			return el.namespaceURI === "http://www.w3.org/2000/svg";
		}
		function handleAnchor(evt) {
			if (evt.defaultPrevented || evt.button !== 0 || evt.metaKey || evt.altKey || evt.ctrlKey || evt.shiftKey) return;
			const a = evt.composedPath().find((el) => el instanceof Node && el.nodeName.toUpperCase() === "A");
			if (!a || explicitLinks && !a.hasAttribute("link")) return;
			const svg = isSvg(a);
			const href = svg ? a.href.baseVal : a.href;
			const target = svg ? a.target.baseVal : a.target;
			if (target || !href && !a.hasAttribute("state")) return;
			const rel = (a.getAttribute("rel") || "").split(/\s+/);
			if (a.hasAttribute("download") || rel && rel.includes("external")) return;
			const url = svg ? new URL(href, document.baseURI) : new URL(href);
			if (url.origin !== window.location.origin || basePath && url.pathname && !url.pathname.toLowerCase().startsWith(basePath.toLowerCase())) return;
			return [a, url];
		}
		function handleAnchorClick(evt) {
			const res = handleAnchor(evt);
			if (!res) return;
			const [a, url] = res;
			const to = router.parsePath(url.pathname + url.search + url.hash);
			const state = a.getAttribute("state");
			evt.preventDefault();
			navigateFromRoute(to, {
				resolve: false,
				replace: a.hasAttribute("replace"),
				scroll: !a.hasAttribute("noscroll"),
				state: state ? JSON.parse(state) : void 0
			});
		}
		function handleAnchorPreload(evt) {
			const res = handleAnchor(evt);
			if (!res) return;
			const [a, url] = res;
			transformUrl && (url.pathname = transformUrl(url.pathname));
			router.preloadRoute(url, a.getAttribute("preload") !== "false");
		}
		function handleAnchorMove(evt) {
			clearTimeout(preloadTimeout);
			const res = handleAnchor(evt);
			if (!res) return lastElement = null;
			const [a, url] = res;
			if (lastElement === a) return;
			transformUrl && (url.pathname = transformUrl(url.pathname));
			preloadTimeout = setTimeout(() => {
				router.preloadRoute(url, a.getAttribute("preload") !== "false");
				lastElement = a;
			}, 20);
		}
		function handleFormSubmit(evt) {
			if (evt.defaultPrevented) return;
			let actionRef = evt.submitter && evt.submitter.hasAttribute("formaction") ? evt.submitter.getAttribute("formaction") : evt.target.getAttribute("action");
			if (!actionRef) return;
			if (!actionRef.startsWith("https://action/")) {
				const url = new URL(actionRef, mockBase);
				actionRef = router.parsePath(url.pathname + url.search);
				if (!actionRef.startsWith(actionBase)) return;
			}
			if (evt.target.method.toUpperCase() !== "POST") throw new Error("Only POST forms are supported for Actions");
			const handler = actions.get(actionRef);
			if (handler) {
				evt.preventDefault();
				const data = new FormData(evt.target, evt.submitter);
				handler.call({
					r: router,
					f: evt.target
				}, evt.target.enctype === "multipart/form-data" ? data : new URLSearchParams(data));
			}
		}
		delegateEvents(["click", "submit"]);
		document.addEventListener("click", handleAnchorClick);
		if (preload) {
			document.addEventListener("mousemove", handleAnchorMove, { passive: true });
			document.addEventListener("focusin", handleAnchorPreload, { passive: true });
			document.addEventListener("touchstart", handleAnchorPreload, { passive: true });
		}
		document.addEventListener("submit", handleFormSubmit);
		onCleanup(() => {
			document.removeEventListener("click", handleAnchorClick);
			if (preload) {
				document.removeEventListener("mousemove", handleAnchorMove);
				document.removeEventListener("focusin", handleAnchorPreload);
				document.removeEventListener("touchstart", handleAnchorPreload);
			}
			document.removeEventListener("submit", handleFormSubmit);
		});
	};
}
function Router(props) {
	if (isServer) return StaticRouter(props);
	const getSource = () => {
		const url = window.location.pathname.replace(/^\/+/, "/") + window.location.search;
		const state = window.history.state && window.history.state._depth && Object.keys(window.history.state).length === 1 ? void 0 : window.history.state;
		return {
			value: url + window.location.hash,
			state
		};
	};
	const beforeLeave = createBeforeLeave();
	return createRouter({
		get: getSource,
		set({ value, replace, scroll, state }) {
			if (replace) window.history.replaceState(keepDepth(state), "", value);
			else window.history.pushState(state, "", value);
			scrollToHash(decodeURIComponent(window.location.hash.slice(1)), scroll);
			saveCurrentDepth();
		},
		init: (notify) => bindEvent(window, "popstate", notifyIfNotBlocked(notify, (delta) => {
			if (delta && delta < 0) return !beforeLeave.confirm(delta);
			else {
				const s = getSource();
				return !beforeLeave.confirm(s.value, { state: s.state });
			}
		})),
		create: setupNativeEvents(props.preload, props.explicitLinks, props.actionBase, props.transformUrl),
		utils: {
			go: (delta) => window.history.go(delta),
			beforeLeave
		}
	})(props);
}
function Navigate(props) {
	const navigate = useNavigate();
	const location = useLocation();
	const { href, state } = props;
	const path = typeof href === "function" ? href({
		navigate,
		location
	}) : href;
	navigate(path, {
		replace: true,
		state
	});
	return null;
}

//#endregion
//#region vendor/solid.ts
var solid_default = html;

//#endregion
export { Navigate, Route, Router, createComponent, createContext, createSignal, solid_default as default, createMemo as memo, onCleanup, render, useContext, useParams };
//# sourceMappingURL=solid.js.map
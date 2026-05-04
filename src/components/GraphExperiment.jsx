import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    useNodesState,
    Handle,
    Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { getClusterMgrSemanticModel } from '../semantic/clusterMgrExample.js';

const CODE_PANEL_MIN_W = 200;
const CODE_PANEL_MAX_W = 720;

const SLOT_PANEL_MIN_W = 220;
const SLOT_PANEL_MAX_W = 560;
const SLOT_PANEL_DEFAULT_W = 400;
/** Ширина колонки кода по умолчанию: ~`CODE_PANEL_TEXT_CH` символов моноширинного текста + gutter (см. `.graph-code-gutter`). */
const CODE_PANEL_TEXT_CH = 85;
const CODE_PANEL_DEFAULT_WIDTH_CSS = `clamp(${CODE_PANEL_MIN_W}px, calc(2.25rem + 10px + ${CODE_PANEL_TEXT_CH}ch + 16px), ${CODE_PANEL_MAX_W}px)`;

/** Корень репозитория/пакета на диске: к `code.file` узлов добавляется как префикс для чтения файла. */
const DEFAULT_PROJECT_ROOT = 'C:\\Users\\User\\phpstorm-projects\\ast\\luminati-proxy';
/** Файл по умолчанию в панели кода, если нет привязки из узла/ребра. */
const DEFAULT_CODE_RELATIVE_FILE = 'lib/cluster_mgr.js';

const NODE_JSON_SNIPPET_CODE = `  "code": {
    "file": "${DEFAULT_CODE_RELATIVE_FILE}",
    "line": 1
  },`;

/** Пример uuid — замените на свободный числовой id при вставке в узел. */
const NODE_JSON_SNIPPET_SLOT = JSON.stringify({ uuid: 50100, name: 'example' }, null, 2);

function joinRootAndRelativeFile(projectRoot, relFile) {
    const root = projectRoot.replace(/[\\/]+$/, '');
    const segs = relFile.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean);
    const winLike = /\\/.test(root) || /^[a-zA-Z]:/.test(root);
    if (winLike) {
        return `${root}\\${segs.join('\\')}`;
    }
    return `${root}/${segs.join('/')}`;
}

/** Оценка габаритов узла для dagre (совпадает по порядку с .graph-flow-node). */
const DAGRE_NODE_W = 248;
const DAGRE_NODE_H = 52;

/**
 * Синтетическая модель: узлы со слотами; links — [from, to] или [from, to, info],
 * слот–слот (uuid слотов) или вызов узел–узел (uuid функций), info — например { file, line }.
 */
export function getSyntheticSemanticModel() {
    const nodes = [
        {
            uuid: 11,
            name: 'R',
            slots: [
                { uuid: 12, name: 'user' },
                { uuid: 13, name: 'x', propOf: 12 },
                { uuid: 14, name: 'y', propOf: 12 },
            ],
        },
        {
            uuid: 1,
            name: 'A',
            slots: [
                { uuid: 5, name: 'user' },
                { uuid: 9, name: 'x', propOf: 5 },
                { uuid: 10, name: 'y', propOf: 5 },
            ],
        },
        {
            uuid: 2,
            name: 'B',
            slots: [{ uuid: 6, name: 'x' }],
        },
        {
            uuid: 3,
            name: 'C',
            slots: [{ uuid: 7, name: 'y' }],
        },
        {
            uuid: 4,
            name: 'D',
            slots: [{ uuid: 8, name: 'user' }],
        },
    ];

    const links = [
        [9, 6],
        [10, 7],
        [5, 8],
        [12, 5],
    ];

    return { nodes, links };
}

export function buildSlotOwnerMap(semantic) {
    const m = new Map();
    for (const n of semantic.nodes) {
        for (const s of n.slots) {
            m.set(s.uuid, n.uuid);
        }
    }
    return m;
}

function buildNodeUuidSet(semantic) {
    return new Set(semantic.nodes.map((n) => n.uuid));
}

/** Подпись endpoint как в select формы связи: узел · name (#id) или слот · name (#id). */
function linkEndpointLabel(semantic, uuid) {
    for (const n of semantic.nodes) {
        if (n.uuid === uuid) {
            return `узел · ${n.name} (#${uuid})`;
        }
        for (const s of n.slots ?? []) {
            if (s.uuid === uuid) {
                return `слот · ${s.name} (#${uuid})`;
            }
        }
    }
    return String(uuid);
}

/**
 * links[i] = [from, to] или [from, to, info], info — произвольный объект (например { file, line }).
 * Слот–слот: from/to — uuid слотов. Вызов: from/to — uuid узлов-функций (не слотов).
 */
export function resolveLinkEndpoints(semantic, a, b) {
    const owners = buildSlotOwnerMap(semantic);
    const nodeUuids = buildNodeUuidSet(semantic);
    const oa = owners.get(a);
    const ob = owners.get(b);
    if (oa != null && ob != null) {
        return { kind: 'slot', srcFn: oa, tgtFn: ob };
    }
    if (nodeUuids.has(a) && nodeUuids.has(b) && oa == null && ob == null) {
        return { kind: 'call', srcFn: a, tgtFn: b };
    }
    return null;
}

function pickCodeRefFromInfos(infos) {
    for (const inf of infos) {
        if (inf && inf.file != null && typeof inf.line === 'number' && inf.line >= 1) {
            return { file: inf.file, line: inf.line };
        }
    }
    return null;
}

/** `code` из третьего элемента связи `[from, to, info]`, если есть file/line. */
function codeRefFromLinkTuple(link) {
    const raw = link.length > 2 ? link[2] : undefined;
    if (raw != null && typeof raw === 'object' && raw.file != null && typeof raw.line === 'number' && raw.line >= 1) {
        return { file: raw.file, line: raw.line };
    }
    return null;
}

/** Id объединённого ребра React Flow для записи в `links`. */
function mergedEdgeIdForSemanticLink(semantic, link) {
    const [a, b] = link;
    const res = resolveLinkEndpoints(semantic, a, b);
    if (res == null || res.srcFn === res.tgtFn) return null;
    return `e-${res.srcFn}-${res.tgtFn}`;
}

/** Удаляет узел-функцию, слоты, слот-связи и call-связи, где участвует этот узел. */
export function removeFnNodeFromSemantic(semantic, fnUuid) {
    const victim = semantic.nodes.find((n) => n.uuid === fnUuid);
    if (!victim) return semantic;
    const dropSlots = new Set(victim.slots.map((s) => s.uuid));
    const owners = buildSlotOwnerMap(semantic);
    const nodeUuids = buildNodeUuidSet(semantic);

    const newLinks = semantic.links.filter((link) => {
        const [a, b] = link;
        const oa = owners.get(a);
        const ob = owners.get(b);
        if (oa != null && ob != null) {
            return !dropSlots.has(a) && !dropSlots.has(b);
        }
        if (nodeUuids.has(a) && nodeUuids.has(b) && oa == null && ob == null) {
            return a !== fnUuid && b !== fnUuid;
        }
        return false;
    });

    return {
        nodes: semantic.nodes.filter((n) => n.uuid !== fnUuid),
        links: newLinks,
    };
}

export function replaceFnNodeInSemantic(semantic, fnUuid, nextNode) {
    const idx = semantic.nodes.findIndex((n) => n.uuid === fnUuid);
    if (idx < 0) return semantic;
    const nodes = semantic.nodes.slice();
    nodes[idx] = nextNode;
    return { ...semantic, nodes };
}

/** Добавляет направленную связь [from, to], если её ещё нет и from !== to. */
export function appendLinkToSemantic(semantic, from, to) {
    if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to)) {
        return semantic;
    }
    if (from === to) return semantic;
    const exists = semantic.links.some(([a, b]) => a === from && b === to);
    if (exists) return semantic;
    return { ...semantic, links: [...semantic.links, [from, to]] };
}

export function removeLinkAtIndex(semantic, index) {
    if (index < 0 || index >= semantic.links.length) return semantic;
    return { ...semantic, links: semantic.links.filter((_, i) => i !== index) };
}

function nextFnNodeUuid(semantic) {
    let max = 0;
    for (const n of semantic.nodes) {
        max = Math.max(max, n.uuid);
    }
    return max + 1;
}

/** Новый узел-функция без привязки к коду; позиция на графе — через dagre при следующем изменении семантики. */
export function addEmptyFnNode(semantic) {
    const newUuid = nextFnNodeUuid(semantic);
    const node = { uuid: newUuid, name: 'Новый узел', slots: [] };
    return {
        semantic: { ...semantic, nodes: [...semantic.nodes, node] },
        newUuid,
    };
}

function randomUuidV4() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function tryParseNodeJson(text, expectedUuid) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, message: 'Синтаксическая ошибка JSON' };
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: 'Корень должен быть объектом' };
    }
    if (parsed.uuid !== expectedUuid) {
        return {
            ok: false,
            message: `Поле uuid должно совпадать с выбранным узлом (${String(expectedUuid)})`,
        };
    }
    return { ok: true, value: parsed };
}

function isGraphHotkeyTargetOk(e) {
    const el = e.target;
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (el.isContentEditable) return false;
    return true;
}

/** Состояние визуала при выбранном слоте: рёбра без слотов в группе всегда dim. */
function mergedEdgeSlotState(selectedSlotUuid, slotPairs) {
    if (selectedSlotUuid == null) return 'normal';
    if (slotPairs.length === 0) return 'dim';
    const hit = slotPairs.some(({ from, to }) => from === selectedSlotUuid || to === selectedSlotUuid);
    return hit ? 'hi' : 'dim';
}

/**
 * Одно ребро на пару узлов: слияние всех слот-связей и call-связей.
 * navigateCodeRef: сначала info с call-связи, иначе первая info со слот-связи.
 */
function buildMergedFnEdgeDescriptors(semantic, selectedSlotUuid) {
    const groups = new Map();

    semantic.links.forEach((link, i) => {
        const a = link[0];
        const b = link[1];
        const rawInfo = link.length > 2 ? link[2] : undefined;
        const info = rawInfo != null && typeof rawInfo === 'object' ? rawInfo : null;
        const res = resolveLinkEndpoints(semantic, a, b);
        if (res == null || res.srcFn === res.tgtFn) return;

        const key = `${res.srcFn}\0${res.tgtFn}`;
        if (!groups.has(key)) {
            groups.set(key, {
                srcFn: res.srcFn,
                tgtFn: res.tgtFn,
                slotPairs: [],
                callInfos: [],
            });
        }
        const g = groups.get(key);
        if (res.kind === 'slot') {
            g.slotPairs.push({ from: a, to: b, info, linkIndex: i });
        } else {
            g.callInfos.push(info);
        }
    });

    return [...groups.values()].map((g) => {
        const edgeState = mergedEdgeSlotState(selectedSlotUuid, g.slotPairs);
        const edgeClickCodeRef = pickCodeRefFromInfos(g.callInfos);
        return {
            id: `e-${g.srcFn}-${g.tgtFn}`,
            source: `n-${g.srcFn}`,
            target: `n-${g.tgtFn}`,
            slotPairs: g.slotPairs,
            callInfos: g.callInfos,
            edgeClickCodeRef,
            hasCallLink: g.callInfos.some((x) => x != null),
            edgeState,
        };
    });
}

/**
 * Начальные позиции через dagre (иерархия по направленным рёбрам между функциями).
 * React Flow сам layout не делает — это стандартная эвристика для directed graphs.
 */
function computeFnPositions(semantic) {
    const list = semantic.nodes;
    const map = {};
    if (list.length === 0) return map;

    const g = new dagre.graphlib.Graph({ multigraph: false });
    g.setGraph({
        rankdir: 'TB',
        ranksep: 72,
        nodesep: 28,
        marginx: 24,
        marginy: 24,
        edgesep: 12,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const n of list) {
        g.setNode(`n-${n.uuid}`, { width: DAGRE_NODE_W, height: DAGRE_NODE_H });
    }

    const edgeKey = new Set();
    for (const link of semantic.links) {
        const [a, b] = link;
        const res = resolveLinkEndpoints(semantic, a, b);
        if (res == null || res.srcFn === res.tgtFn) continue;
        const sid = `n-${res.srcFn}`;
        const tid = `n-${res.tgtFn}`;
        const k = `${sid}\0${tid}`;
        if (edgeKey.has(k)) continue;
        edgeKey.add(k);
        g.setEdge(sid, tid);
    }

    dagre.layout(g);

    for (const n of list) {
        const id = `n-${n.uuid}`;
        const node = g.node(id);
        if (node && typeof node.x === 'number' && typeof node.y === 'number') {
            map[id] = {
                x: node.x - DAGRE_NODE_W / 2,
                y: node.y - DAGRE_NODE_H / 2,
            };
        } else {
            map[id] = { x: 0, y: 0 };
        }
    }
    return map;
}

/** Handles для рёбер скрыты в CSS (.graph-fn-handle). Внешний вид — .graph-flow-node. */
const FnFlowNode = memo(function FnFlowNode({ data, selected }) {
    return (
        <div
            className={`graph-flow-node${selected ? ' graph-flow-node--selected' : ''}`}
            style={{ position: 'relative' }}
        >
            <Handle type="target" position={Position.Top} id="in-top" className="graph-fn-handle" />
            <Handle type="target" position={Position.Right} id="in-right" className="graph-fn-handle" />
            <Handle type="target" position={Position.Bottom} id="in-bottom" className="graph-fn-handle" />
            <Handle type="target" position={Position.Left} id="in-left" className="graph-fn-handle" />
            <Handle type="source" position={Position.Top} id="out-top" className="graph-fn-handle" />
            <Handle type="source" position={Position.Right} id="out-right" className="graph-fn-handle" />
            <Handle type="source" position={Position.Bottom} id="out-bottom" className="graph-fn-handle" />
            <Handle type="source" position={Position.Left} id="out-left" className="graph-fn-handle" />
            {data.label}
        </div>
    );
});

function buildReactFlowNodes(semantic, selectedFnUuid) {
    const posById = computeFnPositions(semantic);
    return semantic.nodes.map((n) => {
        const id = `n-${n.uuid}`;
        const sel = n.uuid === selectedFnUuid;
        const position = posById[id] ?? { x: 0, y: 0 };
        return {
            id,
            type: 'fn',
            position,
            data: { label: n.name },
            selected: sel,
        };
    });
}

function pickFlowHandles(srcPos, tgtPos) {
    const dx = tgtPos.x - srcPos.x;
    const dy = tgtPos.y - srcPos.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx >= 0) return { sourceHandle: 'out-right', targetHandle: 'in-left' };
        return { sourceHandle: 'out-left', targetHandle: 'in-right' };
    }
    if (dy >= 0) return { sourceHandle: 'out-bottom', targetHandle: 'in-top' };
    return { sourceHandle: 'out-top', targetHandle: 'in-bottom' };
}

function positionsFromNodes(nodes) {
    return Object.fromEntries(nodes.map((n) => [n.id, n.position]));
}

function buildReactFlowEdges(semantic, selectedSlotUuid, selectedEdgeId, positionById) {
    const desc = buildMergedFnEdgeDescriptors(semantic, selectedSlotUuid);
    return desc.map((d) => {
        const edgeSel = d.id === selectedEdgeId;
        const hi = d.edgeState === 'hi';
        const dim = d.edgeState === 'dim';
        const sp = positionById[d.source];
        const tp = positionById[d.target];
        const handles =
            sp && tp ? pickFlowHandles(sp, tp) : { sourceHandle: 'out-bottom', targetHandle: 'in-top' };

        let markerEnd = 'gf-arrow-line';
        let stroke = '#64748b';
        let strokeWidth = 1;
        let opacity = dim ? 0.2 : 1;
        let zIndex = 0;

        if (edgeSel) {
            markerEnd = 'gf-arrow-sel';
            stroke = '#a855f7';
            strokeWidth = 2.5;
            opacity = 1;
            zIndex = 15;
        } else if (hi) {
            markerEnd = 'gf-arrow-hi';
            stroke = '#38bdf8';
            strokeWidth = 2;
            zIndex = 10;
        }

        return {
            id: d.id,
            source: d.source,
            target: d.target,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            interactionWidth: 20,
            data: {
                edgeClickCodeRef: d.edgeClickCodeRef,
                hasCallLink: d.hasCallLink,
                slotPairs: d.slotPairs,
            },
            markerEnd,
            style: { stroke, strokeWidth, opacity },
            zIndex,
        };
    });
}

/** Острый вытянутый наконечник (встроенный ArrowClosed в xyflow — широкое основание). */
/** Панель: `codeRef` — `{ file, line }` (1-based); файл читается через backend `GET /api/graph/project-file`. */
function GraphCodePanel({ projectRoot, defaultRelativeFile, codeRef }) {
    const relFile = (codeRef?.file && String(codeRef.file).trim()) || defaultRelativeFile;
    const hiFromRef = codeRef?.line >= 1 ? codeRef.line : null;

    const [fileText, setFileText] = useState('');
    const [loadPhase, setLoadPhase] = useState('idle');
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        const root = projectRoot.trim();
        if (!root) {
            setLoadPhase('err');
            setLoadError('Укажите корень проекта');
            setFileText('');
            return;
        }
        let cancelled = false;
        setLoadPhase('loading');
        setLoadError('');
        const q = `root=${encodeURIComponent(root)}&rel=${encodeURIComponent(relFile)}`;
        fetch(`/api/graph/project-file?${q}`)
            .then(async (r) => {
                const body = await r.text();
                if (!r.ok) {
                    throw new Error(body || r.statusText);
                }
                return body;
            })
            .then((text) => {
                if (!cancelled) {
                    setFileText(text);
                    setLoadPhase('ok');
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setFileText('');
                    setLoadPhase('err');
                    setLoadError(e.message || String(e));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [projectRoot, relFile]);

    const absPath = joinRootAndRelativeFile(projectRoot.trim() || DEFAULT_PROJECT_ROOT, relFile);
    const titleBar = hiFromRef != null ? `${absPath}:${hiFromRef}` : absPath;

    const lines = useMemo(() => fileText.split(/\n/), [fileText]);
    const hiLine =
        hiFromRef != null && loadPhase === 'ok'
            ? Math.min(hiFromRef, Math.max(1, lines.length))
            : null;
    const lineRef = useRef(null);

    useLayoutEffect(() => {
        if (hiLine == null) return;
        lineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [hiLine, titleBar]);

    if (loadPhase === 'loading') {
        return (
            <div className="graph-code-panel graph-code-panel--empty">
                <div className="graph-code-panel-head" title={titleBar}>
                    {titleBar}
                </div>
                <p className="graph-code-missing">Загрузка файла…</p>
            </div>
        );
    }

    if (loadPhase === 'err') {
        return (
            <div className="graph-code-panel graph-code-panel--empty">
                <div className="graph-code-panel-head" title={titleBar}>
                    {titleBar}
                </div>
                <p className="graph-code-missing">
                    Не удалось прочитать файл. Проверьте корень проекта и поле <code>code.file</code> узла.
                    Нужен backend на порту 3000 (<code>npm run server</code>) и прокси с фронта (
                    <code>npm run start</code>). Статическая сборка без API файлы не подгрузит.
                </p>
                {loadError ? (
                    <pre className="graph-code-fetch-error" role="status">
                        {loadError}
                    </pre>
                ) : null}
            </div>
        );
    }

    return (
        <div className="graph-code-panel">
            <div className="graph-code-panel-head" title={titleBar}>
                {titleBar}
            </div>
            <div className="graph-code-scroll">
                {lines.map((text, i) => {
                    const n = i + 1;
                    const on = hiLine != null && n === hiLine;
                    return (
                        <div
                            key={i}
                            className={`graph-code-line${on ? ' graph-code-line--hi' : ''}`}
                            ref={on ? lineRef : undefined}
                        >
                            <span className="graph-code-gutter">
                                <span className="graph-code-gutter-num">{n}</span>
                            </span>
                            <code className="graph-code-text">{text}</code>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function GraphFlowMarkerDefs() {
    return (
        <svg className="graph-flow-marker-defs" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <defs>
                <marker
                    id="gf-arrow-line"
                    markerWidth="11"
                    markerHeight="9"
                    refX="11"
                    refY="4.5"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                >
                    <path d="M 11 4.5 L 0 0.75 L 0 8.25 Z" fill="#64748b" />
                </marker>
                <marker
                    id="gf-arrow-hi"
                    markerWidth="11"
                    markerHeight="9"
                    refX="11"
                    refY="4.5"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                >
                    <path d="M 11 4.5 L 0 0.75 L 0 8.25 Z" fill="#38bdf8" />
                </marker>
                <marker
                    id="gf-arrow-sel"
                    markerWidth="11"
                    markerHeight="9"
                    refX="11"
                    refY="4.5"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                >
                    <path d="M 11 4.5 L 0 0.75 L 0 8.25 Z" fill="#a855f7" />
                </marker>
            </defs>
        </svg>
    );
}

function ReactFlowPanel({
    semantic,
    selectedFnUuid,
    selectedEdgeId,
    onSelectFn,
    onClear,
    onEdgeSelect,
    onCreateNode,
    interactionDisabled,
}) {
    const nodeTypes = useMemo(() => ({ fn: FnFlowNode }), []);
    const didFitRef = useRef(false);

    const [nodes, setNodes, onNodesChange] = useNodesState(() =>
        buildReactFlowNodes(semantic, selectedFnUuid),
    );

    useLayoutEffect(() => {
        setNodes((prev) => {
            const fresh = buildReactFlowNodes(semantic, selectedFnUuid);
            const posById = new Map(prev.map((n) => [n.id, n.position]));
            return fresh.map((n) => ({
                ...n,
                position: posById.get(n.id) ?? n.position,
            }));
        });
    }, [semantic, selectedFnUuid, setNodes]);

    const edges = useMemo(
        () =>
            buildReactFlowEdges(semantic, null, selectedEdgeId, positionsFromNodes(nodes)),
        [semantic, selectedEdgeId, nodes],
    );

    const onInit = useCallback((inst) => {
        if (didFitRef.current) return;
        didFitRef.current = true;
        queueMicrotask(() => inst.fitView({ padding: 0.25 }));
    }, []);

    const onEdgesChange = useCallback(() => {}, []);

    const onNodeClick = useCallback(
        (_, node) => {
            const m = /^n-(\d+)$/.exec(node.id);
            if (m) onSelectFn(Number(m[1]));
        },
        [onSelectFn],
    );

    const onEdgeClick = useCallback(
        (_, edge) => {
            onEdgeSelect(edge);
        },
        [onEdgeSelect],
    );

    return (
        <>
            <GraphFlowMarkerDefs />
            <div className={interactionDisabled ? 'graph-react-flow-block' : undefined}>
                <ReactFlow
                    className="graph-react-flow"
                    nodeTypes={nodeTypes}
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={onClear}
                    onInit={onInit}
                    proOptions={{ hideAttribution: true }}
                    nodesConnectable={false}
                    edgesUpdatable={false}
                    edgesFocusable
                >
                    <Background gap={20} size={1} color="rgba(15, 23, 42, 0.09)" />
                    <Controls />
                    <MiniMap pannable zoomable />
                    <Panel position="top-right">
                        <button
                            type="button"
                            className="graph-floating-create-node-btn"
                            title="Создать узел"
                            aria-label="Создать узел"
                            disabled={interactionDisabled}
                            onClick={(e) => {
                                e.stopPropagation();
                                onCreateNode();
                            }}
                        >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                        >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <path d="M12 8v8M8 12h8" />
                        </svg>
                    </button>
                </Panel>
                </ReactFlow>
            </div>
        </>
    );
}

function GraphSlotEmptyPanel({ loading }) {
    return (
        <aside className="graph-slot-panel">
            <p className="graph-slot-panel-hint">
                {loading
                    ? 'Загрузка графа…'
                    : 'Выберите узел на графе или создайте новый. Связи добавляются в панели узла.'}
            </p>
        </aside>
    );
}

function parseNumericUuidInput(text) {
    const m = /^\s*(\d+)\s*$/.exec(text ?? '');
    return m ? Number(m[1]) : null;
}

function NodeJsonSidePanel({
    semantic,
    selectedFnUuid,
    selectedEdgeId,
    onDeleteFn,
    onSaveNode,
    onAddLink,
    onRemoveLinkAtIndex,
    onSelectLinkForGraph,
}) {
    const fn = semantic.nodes.find((n) => n.uuid === selectedFnUuid);
    const [jsonDraft, setJsonDraft] = useState('');
    const textareaRef = useRef(null);
    const restoreCaretRef = useRef(null);
    const [linkFrom, setLinkFrom] = useState('');
    const [linkToInput, setLinkToInput] = useState('');
    const [linkFormError, setLinkFormError] = useState('');

    useEffect(() => {
        if (!fn) return;
        setJsonDraft(JSON.stringify(fn, null, 2));
    }, [selectedFnUuid, fn]);

    useEffect(() => {
        setLinkFrom('');
        setLinkToInput('');
        setLinkFormError('');
    }, [selectedFnUuid]);

    useLayoutEffect(() => {
        const pos = restoreCaretRef.current;
        if (pos == null) return;
        restoreCaretRef.current = null;
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(pos, pos);
    }, [jsonDraft]);

    const insertUuidAtCursor = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const uuid = randomUuidV4();
        const next = jsonDraft.slice(0, start) + uuid + jsonDraft.slice(end);
        restoreCaretRef.current = start + uuid.length;
        setJsonDraft(next);
    }, [jsonDraft]);

    const parseResult = useMemo(() => {
        if (fn == null || selectedFnUuid == null) {
            return { ok: false, message: '' };
        }
        return tryParseNodeJson(jsonDraft, selectedFnUuid);
    }, [jsonDraft, selectedFnUuid, fn]);

    const linksTouchingNode = useMemo(() => {
        if (!fn) return [];
        const ids = new Set([fn.uuid, ...(fn.slots ?? []).map((s) => s.uuid)]);
        return semantic.links
            .map((link, index) => ({ link, index }))
            .filter(({ link }) => ids.has(link[0]) || ids.has(link[1]));
    }, [semantic.links, fn]);

    if (!fn) return null;

    const canSave = parseResult.ok === true;
    const linkToNum = parseNumericUuidInput(linkToInput);
    const linkFromNum = linkFrom === '' ? null : Number(linkFrom);
    const canAddLink =
        linkFrom !== '' &&
        linkFromNum != null &&
        Number.isFinite(linkFromNum) &&
        linkToNum != null &&
        linkFromNum !== linkToNum;

    const submitLink = () => {
        if (!canAddLink) {
            setLinkFormError('Выберите uuid слева и вставьте целевой числовой uuid справа');
            return;
        }
        if (semantic.links.some(([a, b]) => a === linkFromNum && b === linkToNum)) {
            setLinkFormError('Такая связь уже есть');
            return;
        }
        setLinkFormError('');
        setLinkToInput('');
        onAddLink(linkFromNum, linkToNum);
    };

    return (
        <aside className="graph-slot-panel">
            <div className="graph-slot-panel-field graph-node-json-editor">
                <div className="graph-node-json-label-row">
                    <label className="graph-slot-panel-label" htmlFor="graph-node-json-textarea">
                        Узел (JSON)
                    </label>
                    <button
                        type="button"
                        className="graph-node-json-uuid-btn"
                        title="Вставить UUID в позицию курсора"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={insertUuidAtCursor}
                    >
                        uuid
                    </button>
                </div>
                <textarea
                    ref={textareaRef}
                    id="graph-node-json-textarea"
                    className="graph-node-json-textarea"
                    spellCheck={false}
                    value={jsonDraft}
                    onChange={(e) => setJsonDraft(e.target.value)}
                />
                {parseResult.ok ? null : (
                    <p className="graph-node-json-error" role="status">
                        {parseResult.message}
                    </p>
                )}
                <div className="graph-node-json-snippets" aria-label="Шаблоны для копирования в JSON">
                    <div className="graph-node-json-snippet">
                        <span className="graph-node-json-snippet-label">code</span>
                        <pre className="graph-node-json-snippet-pre">{NODE_JSON_SNIPPET_CODE}</pre>
                    </div>
                    <div className="graph-node-json-snippet">
                        <span className="graph-node-json-snippet-label">
                            слот <span className="graph-node-json-snippet-hint">(элемент массива slots, uuid замените)</span>
                        </span>
                        <pre className="graph-node-json-snippet-pre">{NODE_JSON_SNIPPET_SLOT}</pre>
                    </div>
                </div>
                <div className="graph-node-links-for-node" aria-label="Связи, затрагивающие этот узел">
                    <span className="graph-node-json-snippet-label">Связи с этим узлом</span>
                    {linksTouchingNode.length === 0 ? (
                        <p className="graph-node-links-empty">Нет</p>
                    ) : (
                        <ul className="graph-node-links-list">
                            {linksTouchingNode.map(({ link, index }) => {
                                const a = link[0];
                                const b = link[1];
                                const leftText = linkEndpointLabel(semantic, a);
                                const mergedId = mergedEdgeIdForSemanticLink(semantic, link);
                                const rowSelected = mergedId != null && selectedEdgeId === mergedId;
                                const extra =
                                    link.length > 2 ? (
                                        <span className="graph-node-links-extra">
                                            {' '}
                                            {JSON.stringify(link.slice(2))}
                                        </span>
                                    ) : null;
                                return (
                                    <li
                                        key={`${index}-${a}-${b}`}
                                        role="button"
                                        tabIndex={0}
                                        className={`graph-node-links-row${rowSelected ? ' graph-node-links-row--selected' : ''}`}
                                        onClick={() => onSelectLinkForGraph(link)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onSelectLinkForGraph(link);
                                            }
                                        }}
                                    >
                                        <code className="graph-node-links-code">
                                            <span className="graph-node-links-from">{leftText}</span>
                                            <span className="graph-node-links-arrow"> → </span>
                                            <span className="graph-node-links-to">{b}</span>
                                            {extra}
                                        </code>
                                        <button
                                            type="button"
                                            className="graph-node-links-remove"
                                            title="Удалить связь"
                                            aria-label="Удалить связь"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveLinkAtIndex(index);
                                            }}
                                        >
                                            ×
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                <div className="graph-node-link-form">
                    <label className="visually-hidden" htmlFor="graph-node-link-from">
                        UUID источника (узел или слот)
                    </label>
                    <select
                        id="graph-node-link-from"
                        className="graph-node-link-from"
                        value={linkFrom}
                        onChange={(e) => {
                            setLinkFrom(e.target.value);
                            setLinkFormError('');
                        }}
                        aria-label="UUID источника"
                    >
                        <option value="">— uuid —</option>
                        <option value={String(fn.uuid)}>
                            узел · {fn.name} (#{fn.uuid})
                        </option>
                        {(fn.slots ?? []).map((s) => (
                            <option key={s.uuid} value={String(s.uuid)}>
                                слот · {s.name} (#{s.uuid})
                            </option>
                        ))}
                    </select>
                    <label className="visually-hidden" htmlFor="graph-node-link-to">
                        UUID цели (вставить из буфера)
                    </label>
                    <input
                        id="graph-node-link-to"
                        type="text"
                        className="graph-node-link-to"
                        inputMode="numeric"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="→ uuid"
                        value={linkToInput}
                        onChange={(e) => {
                            setLinkToInput(e.target.value);
                            setLinkFormError('');
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                submitLink();
                            }
                        }}
                        aria-label="UUID цели"
                    />
                    <button
                        type="button"
                        className="graph-node-link-add-btn"
                        disabled={!canAddLink}
                        title="Добавить связь"
                        aria-label="Добавить связь"
                        onClick={submitLink}
                    >
                        <svg
                            className="graph-node-link-add-icon"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                        >
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                    </button>
                </div>
                {linkFormError ? (
                    <p className="graph-node-link-form-error" role="status">
                        {linkFormError}
                    </p>
                ) : null}
            </div>
            <div className="graph-side-panel-actions-row">
                <button
                    type="button"
                    className="graph-node-json-save-btn"
                    disabled={!canSave}
                    onClick={() => {
                        if (!parseResult.ok) return;
                        onSaveNode(selectedFnUuid, parseResult.value);
                    }}
                >
                    Сохранить
                </button>
                <button type="button" className="graph-experiment-delete-btn" onClick={() => onDeleteFn(fn.uuid)}>
                    Удалить узел
                </button>
            </div>
        </aside>
    );
}

const GraphExperiment = () => {
    const [semantic, setSemantic] = useState(() => ({ nodes: [], links: [] }));
    const [selectedFnUuid, setSelectedFnUuid] = useState(null);
    const [projectRoot, setProjectRoot] = useState(DEFAULT_PROJECT_ROOT);
    const [graphReady, setGraphReady] = useState(false);
    const allowGraphPersist = useRef(false);

    const selectedFn = useMemo(
        () => semantic.nodes.find((n) => n.uuid === selectedFnUuid) ?? null,
        [semantic.nodes, selectedFnUuid],
    );

    const [edgeCodeRef, setEdgeCodeRef] = useState(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState(null);

    const codeRef = edgeCodeRef ?? selectedFn?.code ?? null;

    /** null — ширина по умолчанию (`85ch` + gutter); иначе px после перетаскивания разделителя. */
    const [codePanelWidthPx, setCodePanelWidthPx] = useState(null);
    const codePanelColumnRef = useRef(null);

    /** null — ширина правой панели по умолчанию; иначе px после перетаскивания. */
    const [slotPanelWidthPx, setSlotPanelWidthPx] = useState(null);
    const slotPanelColumnRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [cfgRes, semRes] = await Promise.all([
                    fetch('/api/graph/config'),
                    fetch('/api/graph/semantic'),
                ]);
                const cfgJ = await cfgRes.json().catch(() => ({}));
                const data = await semRes.json().catch(() => ({ nodes: [], links: [] }));
                if (cancelled) return;
                if (typeof cfgJ.projectRoot === 'string' && cfgJ.projectRoot.length > 0) {
                    setProjectRoot(cfgJ.projectRoot);
                }
                const nodes = Array.isArray(data.nodes) ? data.nodes : [];
                const links = Array.isArray(data.links) ? data.links : [];
                const hasAny = nodes.length > 0 || links.length > 0;
                setSemantic(hasAny ? { nodes, links } : getClusterMgrSemanticModel());
            } catch (e) {
                console.warn('graph load failed', e);
                if (!cancelled) {
                    setSemantic(getClusterMgrSemanticModel());
                }
            } finally {
                if (!cancelled) {
                    allowGraphPersist.current = true;
                    setGraphReady(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!allowGraphPersist.current) return;
        const t = window.setTimeout(() => {
            fetch('/api/graph/semantic', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(semantic),
            })
                .then((r) => {
                    if (!r.ok) console.warn('graph persist failed', r.status);
                })
                .catch((e) => console.warn('graph persist', e));
        }, 500);
        return () => window.clearTimeout(t);
    }, [semantic]);

    const codePanelColumnStyle = useMemo(() => {
        if (codePanelWidthPx != null) {
            return { width: codePanelWidthPx, flex: `0 0 ${codePanelWidthPx}px`, minWidth: 0 };
        }
        return {
            flex: '0 0 auto',
            width: CODE_PANEL_DEFAULT_WIDTH_CSS,
            minWidth: CODE_PANEL_MIN_W,
            maxWidth: CODE_PANEL_MAX_W,
        };
    }, [codePanelWidthPx]);

    const onCodeResizeMouseDown = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const el = codePanelColumnRef.current;
        const startW =
            codePanelWidthPx ?? Math.round(el?.getBoundingClientRect().width ?? CODE_PANEL_MIN_W);
        const onMove = (ev) => {
            const w = Math.min(
                CODE_PANEL_MAX_W,
                Math.max(CODE_PANEL_MIN_W, startW + ev.clientX - startX),
            );
            setCodePanelWidthPx(w);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [codePanelWidthPx]);

    const slotPanelColumnStyle = useMemo(() => {
        if (slotPanelWidthPx != null) {
            return { width: slotPanelWidthPx, flex: `0 0 ${slotPanelWidthPx}px`, minWidth: 0 };
        }
        return {
            flex: `0 0 ${SLOT_PANEL_DEFAULT_W}px`,
            width: SLOT_PANEL_DEFAULT_W,
            minWidth: SLOT_PANEL_MIN_W,
            maxWidth: SLOT_PANEL_MAX_W,
        };
    }, [slotPanelWidthPx]);

    const onSlotResizeMouseDown = useCallback((e) => {
        e.preventDefault();
        const startX = e.clientX;
        const el = slotPanelColumnRef.current;
        const startW =
            slotPanelWidthPx ??
            Math.round(el?.getBoundingClientRect().width ?? SLOT_PANEL_DEFAULT_W);
        const onMove = (ev) => {
            const w = Math.min(
                SLOT_PANEL_MAX_W,
                Math.max(SLOT_PANEL_MIN_W, startW + (startX - ev.clientX)),
            );
            setSlotPanelWidthPx(w);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [slotPanelWidthPx]);

    const onSaveNode = useCallback((fnUuid, nextNode) => {
        setSemantic((s) => replaceFnNodeInSemantic(s, fnUuid, nextNode));
    }, []);

    const onAddLink = useCallback((from, to) => {
        setSemantic((s) => appendLinkToSemantic(s, from, to));
    }, []);

    const onRemoveLinkAtIndex = useCallback((index) => {
        setSemantic((s) => removeLinkAtIndex(s, index));
    }, []);

    const onCreateNode = useCallback(() => {
        let newUuid;
        setSemantic((sem) => {
            const { semantic: next, newUuid: id } = addEmptyFnNode(sem);
            newUuid = id;
            return next;
        });
        setSelectedFnUuid(newUuid);
        setEdgeCodeRef(null);
        setSelectedEdgeId(null);
    }, []);

    const onSelectFn = useCallback((fnUuid) => {
        setSelectedFnUuid(fnUuid);
        setEdgeCodeRef(null);
        setSelectedEdgeId(null);
    }, []);

    const onClear = useCallback(() => {
        setSelectedFnUuid(null);
        setEdgeCodeRef(null);
        setSelectedEdgeId(null);
    }, []);

    const onEdgeSelect = useCallback((edge) => {
        setSelectedEdgeId(edge.id);
        setEdgeCodeRef(edge.data?.edgeClickCodeRef ?? null);
    }, []);

    const onSelectLinkForGraph = useCallback((link) => {
        const id = mergedEdgeIdForSemanticLink(semantic, link);
        setSelectedEdgeId(id);
        setEdgeCodeRef(codeRefFromLinkTuple(link));
    }, [semantic]);

    const onDeleteFn = useCallback((fnUuid) => {
        setSemantic((sem) => removeFnNodeFromSemantic(sem, fnUuid));
        setSelectedFnUuid((cur) => (cur === fnUuid ? null : cur));
        setEdgeCodeRef(null);
        setSelectedEdgeId(null);
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if (selectedFnUuid == null) return;
            if (!isGraphHotkeyTargetOk(e)) return;
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            e.preventDefault();
            onDeleteFn(selectedFnUuid);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedFnUuid, onDeleteFn]);

    return (
        <div className="graph-experiment">
            <div className="graph-experiment-body">
                <div ref={codePanelColumnRef} className="graph-code-panel-column" style={codePanelColumnStyle}>
                    <div className="graph-project-root-bar">
                        <label className="graph-project-root-label" htmlFor="graph-project-root-input">
                            Корень проекта
                        </label>
                        <input
                            id="graph-project-root-input"
                            type="text"
                            className="graph-project-root-input"
                            spellCheck={false}
                            autoComplete="off"
                            value={projectRoot}
                            onChange={(e) => setProjectRoot(e.target.value)}
                            title="Каталог на диске: к полю code.file узлов добавляется как префикс"
                        />
                    </div>
                    <GraphCodePanel
                        projectRoot={projectRoot}
                        defaultRelativeFile={DEFAULT_CODE_RELATIVE_FILE}
                        codeRef={codeRef}
                    />
                </div>
                <div
                    className="graph-code-resizer"
                    onMouseDown={onCodeResizeMouseDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Ширина панели кода"
                />
                <div className="graph-experiment-canvas-wrap">
                    <ReactFlowPanel
                        semantic={semantic}
                        selectedFnUuid={selectedFnUuid}
                        selectedEdgeId={selectedEdgeId}
                        onSelectFn={onSelectFn}
                        onClear={onClear}
                        onEdgeSelect={onEdgeSelect}
                        onCreateNode={onCreateNode}
                        interactionDisabled={!graphReady}
                    />
                </div>
                <div
                    className="graph-slot-resizer"
                    onMouseDown={onSlotResizeMouseDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Ширина правой панели"
                />
                <div
                    ref={slotPanelColumnRef}
                    className="graph-slot-panel-column"
                    style={slotPanelColumnStyle}
                >
                    {selectedFnUuid == null ? (
                        <GraphSlotEmptyPanel loading={!graphReady} />
                    ) : (
                        <NodeJsonSidePanel
                            semantic={semantic}
                            selectedFnUuid={selectedFnUuid}
                            selectedEdgeId={selectedEdgeId}
                            onDeleteFn={onDeleteFn}
                            onSaveNode={onSaveNode}
                            onAddLink={onAddLink}
                            onRemoveLinkAtIndex={onRemoveLinkAtIndex}
                            onSelectLinkForGraph={onSelectLinkForGraph}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default GraphExperiment;

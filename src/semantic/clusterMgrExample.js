/**
 * Пример семантики для lib/cluster_mgr.js — объёмный «реалистичный» граф
 * без претензии на полный AST: методы класса, кусок модуля (ключи), внешние API.
 *
 * `code.file` — путь относительно «корня проекта» в UI графа (по умолчанию каталог luminati-proxy).
 *
 * links: [slotA, slotB] или [fnA, fnB, { file, line }] для явного вызова между узлами.
 */

export function getClusterMgrSemanticModel() {
    const nodes = [
        {
            uuid: 1101,
            name: 'Cluster_mgr.run',
            code: { file: 'lib/cluster_mgr.js', line: 22 },
            slots: [
                { uuid: 50101, name: 'this.mgr' },
                { uuid: 50102, name: 'argv' },
                { uuid: 50103, name: 'num_workers' },
                { uuid: 50104, name: 'setupMaster' },
                { uuid: 50105, name: 'fork_each' },
                { uuid: 50106, name: 'exit_listener' },
            ],
        },
        {
            uuid: 1102,
            name: 'Cluster_mgr.worker_send',
            code: { file: 'lib/cluster_mgr.js', line: 48 },
            slots: [
                { uuid: 50201, name: 'worker' },
                { uuid: 50202, name: 'message' },
                { uuid: 50203, name: 'send_cb' },
                { uuid: 50204, name: 'guard_warn' },
            ],
        },
        {
            uuid: 1103,
            name: 'Cluster_mgr.on_worker_exit',
            code: { file: 'lib/cluster_mgr.js', line: 64 },
            slots: [
                { uuid: 50301, name: 'worker' },
                { uuid: 50302, name: 'code' },
                { uuid: 50303, name: 'signal' },
                { uuid: 50304, name: 'restart_path' },
            ],
        },
        {
            uuid: 1104,
            name: 'Cluster_mgr.init_worker',
            code: { file: 'lib/cluster_mgr.js', line: 77 },
            slots: [
                { uuid: 50401, name: 'worker' },
                { uuid: 50402, name: 'level' },
                { uuid: 50403, name: 'to_setup' },
            ],
        },
        {
            uuid: 1105,
            name: 'Cluster_mgr.send_worker_setup',
            code: { file: 'lib/cluster_mgr.js', line: 81 },
            slots: [
                { uuid: 50501, name: 'worker' },
                { uuid: 50502, name: 'level' },
                { uuid: 50503, name: 'payload' },
                { uuid: 50504, name: 'ssl_ca' },
                { uuid: 50505, name: 'keys_ref' },
                { uuid: 50506, name: 'ssl_ips' },
            ],
        },
        {
            uuid: 1106,
            name: 'Cluster_mgr.run_workers',
            code: { file: 'lib/cluster_mgr.js', line: 97 },
            slots: [
                { uuid: 50601, name: 'num_workers' },
                { uuid: 50602, name: 'recreate_loop' },
            ],
        },
        {
            uuid: 1107,
            name: 'Cluster_mgr.recreate_worker',
            code: { file: 'lib/cluster_mgr.js', line: 105 },
            slots: [
                { uuid: 50701, name: 'fork' },
                { uuid: 50702, name: 'level' },
                { uuid: 50703, name: 'init' },
                { uuid: 50704, name: 'proxy_ports' },
                { uuid: 50705, name: 'log_pid' },
            ],
        },
        {
            uuid: 1108,
            name: 'Cluster_mgr.kill_workers',
            code: { file: 'lib/cluster_mgr.js', line: 114 },
            slots: [
                { uuid: 50801, name: 'each_worker' },
                { uuid: 50802, name: 'remove_from_port' },
                { uuid: 50803, name: 'disconnect' },
                { uuid: 50804, name: 'kill_proc' },
            ],
        },
        {
            uuid: 1109,
            name: 'Cluster_mgr.workers_running',
            code: { file: 'lib/cluster_mgr.js', line: 125 },
            slots: [{ uuid: 50901, name: 'cluster.workers' }],
        },
        {
            uuid: 1110,
            name: 'Cluster_mgr.broadcast',
            code: { file: 'lib/cluster_mgr.js', line: 128 },
            slots: [
                { uuid: 51001, name: 'code' },
                { uuid: 51002, name: 'payload' },
                { uuid: 51003, name: 'fanout_send' },
            ],
        },
        {
            uuid: 1111,
            name: 'Cluster_mgr.health_check',
            code: { file: 'lib/cluster_mgr.js', line: 132 },
            slots: [
                { uuid: 51101, name: 'inited' },
                { uuid: 51102, name: 'count' },
                { uuid: 51103, name: 'schedule_restart' },
                { uuid: 51104, name: 'cancel_restart' },
            ],
        },
        {
            uuid: 1112,
            name: 'module (top)',
            code: { file: 'lib/cluster_mgr.js', line: 12 },
            slots: [
                { uuid: 51201, name: 'forge.keys' },
                { uuid: 51202, name: 'privateKeyPem' },
                { uuid: 51203, name: 'publicKeyPem' },
                { uuid: 51204, name: 'no_workers_timeout' },
            ],
        },
        {
            uuid: 1113,
            name: 'cluster',
            code: { file: 'lib/cluster_mgr.js', line: 4 },
            slots: [
                { uuid: 51301, name: 'setupMaster' },
                { uuid: 51302, name: 'fork' },
                { uuid: 51303, name: 'on(exit)' },
                { uuid: 51304, name: 'workers' },
            ],
        },
        {
            uuid: 1114,
            name: 'logger',
            code: { file: 'lib/cluster_mgr.js', line: 10 },
            slots: [
                { uuid: 51401, name: 'system' },
                { uuid: 51402, name: 'warn' },
                { uuid: 51403, name: 'error' },
                { uuid: 51404, name: 'notice' },
            ],
        },
        {
            uuid: 1115,
            name: 'this.mgr',
            code: { file: 'lib/cluster_mgr.js', line: 18 },
            slots: [
                { uuid: 51501, name: 'argv' },
                { uuid: 51502, name: '_defaults' },
                { uuid: 51503, name: 'get_logger_level' },
                { uuid: 51504, name: 'get_ssl_ca' },
                { uuid: 51505, name: 'perr' },
                { uuid: 51506, name: 'process_exit' },
                { uuid: 51507, name: 'proxy_ports' },
            ],
        },
        {
            uuid: 1116,
            name: 'proxy_port',
            code: { file: 'lib/cluster_mgr.js', line: 110 },
            slots: [
                { uuid: 51601, name: 'setup_worker' },
                { uuid: 51602, name: 'remove_worker' },
            ],
        },
        {
            uuid: 1117,
            name: 'lpm_file',
            code: { file: 'lib/cluster_mgr.js', line: 7 },
            slots: [{ uuid: 51701, name: 'work_dir' }],
        },
        {
            uuid: 1118,
            name: 'date',
            code: { file: 'lib/cluster_mgr.js', line: 8 },
            slots: [
                { uuid: 51801, name: 'ms.MIN' },
                { uuid: 51802, name: 'describe_interval' },
            ],
        },
        {
            uuid: 1119,
            name: 'zerr',
            code: { file: 'lib/cluster_mgr.js', line: 9 },
            slots: [{ uuid: 51901, name: 'e2s' }],
        },
        {
            uuid: 1120,
            name: 'os',
            code: { file: 'lib/cluster_mgr.js', line: 5 },
            slots: [{ uuid: 52001, name: 'cpus' }],
        },
    ];

    const links = [
        [50101, 51501],
        [50101, 51502],
        [50102, 51701],
        [50103, 52001],
        [50104, 51301],
        [50105, 51302],
        [50105, 50401],
        [50106, 51303],
        [50106, 50301],
        [50403, 50501],
        [50503, 50202],
        [50504, 51504],
        [50503, 51502],
        [50503, 51501],
        [50505, 51201],
        [50506, 51502],
        [50506, 51501],
        [50204, 51402],
        [50203, 51403],
        [50203, 51901],
        [50304, 51505],
        [50304, 51402],
        [50304, 50701],
        [50602, 50701],
        [50601, 52001],
        [50701, 51302],
        [50702, 51503],
        [50703, 50401],
        [50704, 51601],
        [50705, 51404],
        [50802, 51602],
        [50801, 51304],
        [51003, 50202],
        [51001, 50202],
        [51102, 50901],
        [51103, 51802],
        [51103, 51506],
        [51103, 51204],
        [51104, 51401],
        [51204, 51801],
        [50104, 51401],
        [50602, 51404],
        [50501, 50201],
        [50401, 50201],
        [50301, 50801],
        [51002, 50202],
        [50702, 50402],
        [50402, 50502],
        [1101, 1104, { file: 'lib/cluster_mgr.js', line: 43 }],
        [1103, 1107, { file: 'lib/cluster_mgr.js', line: 75 }],
        [1107, 1104, { file: 'lib/cluster_mgr.js', line: 108 }],
        [1104, 1105, { file: 'lib/cluster_mgr.js', line: 79 }],
    ];

    return { nodes, links };
}

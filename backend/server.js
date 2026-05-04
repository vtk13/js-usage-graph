const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const fs = require('fs').promises;
const DatabaseService = require('./DatabaseService');
const FileService = require('./FileService');
const Joi = require('joi');

const dbService = new DatabaseService(path.join(__dirname, 'data'));
const fileService = new FileService();
const GRAPH_CONFIG_PATH = path.join(__dirname, '..', 'config', 'graph.json');

// Enable JSON parsing
app.use(express.json());

// Validation schemas
const bookmarkUpdateSchema = Joi.object({
    title: Joi.string().allow('').optional(),
    comment: Joi.string().allow('').optional(),
    status: Joi.string().valid('new', 'inprogress', 'done').optional(),
    parent_id: Joi.string().allow(null).optional(),
    order_id: Joi.number().optional()
}).min(1);

const bookmarkCreateSchema = Joi.object({
    title: Joi.string().optional(),
    comment: Joi.string().allow('').optional(),
    codeLocation: Joi.object({
        file_id: Joi.string().required(),
        type: Joi.string().required(),
        start: Joi.number().required()
    }).optional(),
    parent_id: Joi.string().allow(null).optional(),
    order_id: Joi.number().optional()
}).min(1);

const graphSemanticPutSchema = Joi.object({
    nodes: Joi.array().items(Joi.object().unknown(true)).required(),
    links: Joi.array()
        .items(
            Joi.array()
                .min(2)
                .items(Joi.any()),
        )
        .required(),
}).required();

// API endpoint to get folders
app.get('/api/folders', async (req, res) => {
    try {
        const folders = await dbService.getFolders();
        res.json(folders.map(folder => ({
            id: folder._id,
            path: folder.path
        })));
    } catch (error) {
        console.error('Error getting folders:', error);
        res.status(500).json({ error: 'Failed to get folders' });
    }
});

// API endpoint to get files and subfolders
app.get('/api/files', async (req, res) => {
    try {
        const { folder_id, sub_path } = req.query;
        if (!folder_id) {
            return res.status(400).json({ error: 'Folder ID is required' });
        }

        const files = await dbService.getFolderFiles(folder_id);
        
        // Get unique subfolders
        const subfolders = new Set();
        files.forEach(file => {
            if (file.sub_path.startsWith(sub_path)) {
                const remainingPath = file.sub_path.slice(sub_path.length).replace(/^\/+/, '');
                const firstComponent = remainingPath.split('/')[0];
                if (firstComponent) {
                    subfolders.add(firstComponent);
                }
            }
        });

        // Get files in current sub_path
        const currentFiles = files.filter(file => file.sub_path === sub_path);

        res.json([
            ...Array.from(subfolders)
                .sort((a, b) => a.localeCompare(b))
                .map(folder => ({
                    type: 'folder',
                    sub_path: sub_path ? `${sub_path}/${folder}` : folder,
                    filename: folder
                })),
            ...currentFiles
                .sort((a, b) => a.filename.localeCompare(b.filename))
                .map(file => ({
                    type: 'file',
                    sub_path: file.sub_path,
                    filename: file.filename,
                    file_id: file._id
                }))
        ]);
    } catch (error) {
        console.error('Error getting files:', error);
        res.status(500).json({ error: 'Failed to get files' });
    }
});

/** Статический конфиг графа: корень проекта на диске и т.п. */
app.get('/api/graph/config', async (req, res) => {
    try {
        const raw = await fs.readFile(GRAPH_CONFIG_PATH, 'utf8');
        res.json(JSON.parse(raw));
    } catch (err) {
        console.warn('graph config read failed:', err.message);
        res.json({ projectRoot: '' });
    }
});

/** Семантика графа из NeDB (узлы и связи по одному документу). */
app.get('/api/graph/semantic', async (req, res) => {
    try {
        const data = await dbService.getGraphSemantic();
        res.json(data);
    } catch (error) {
        console.error('Error getting graph semantic:', error);
        res.status(500).json({ error: 'Failed to get graph semantic' });
    }
});

app.put('/api/graph/semantic', async (req, res) => {
    try {
        const { error, value } = graphSemanticPutSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }
        const { nodes, links } = value;
        for (let i = 0; i < links.length; i++) {
            const row = links[i];
            if (typeof row[0] !== 'number' || typeof row[1] !== 'number') {
                return res.status(400).json({
                    error: `links[${i}]: first two elements must be numeric uuids`,
                });
            }
        }
        await dbService.replaceGraphSemantic({ nodes, links });
        res.json({ ok: true });
    } catch (error) {
        console.error('Error saving graph semantic:', error);
        res.status(500).json({ error: 'Failed to save graph semantic' });
    }
});

/** Панель графа: сырой текст файла по корню проекта на диске и относительному пути (`code.file` узла). */
app.get('/api/graph/project-file', async (req, res) => {
    try {
        const root = req.query.root;
        const rel = req.query.rel;
        if (!root || typeof root !== 'string' || !rel || typeof rel !== 'string') {
            return res.status(400).type('text/plain').send('expected root and rel query params');
        }
        const relNorm = rel.replace(/\\/g, '/').replace(/^\/+/, '');
        if (relNorm.includes('..')) {
            return res.status(400).type('text/plain').send('invalid rel path');
        }
        const absRoot = path.resolve(root.trim());
        const absFile = path.resolve(absRoot, relNorm);
        const relSeen = path.relative(absRoot, absFile);
        if (relSeen.startsWith('..') || path.isAbsolute(relSeen)) {
            return res.status(403).type('text/plain').send('path outside project root');
        }
        const data = await fs.readFile(absFile, 'utf8');
        res.type('text/plain; charset=utf-8').send(data);
    } catch (err) {
        res.status(404).type('text/plain; charset=utf-8').send(err.message || String(err));
    }
});

// API endpoint to get file content
app.get('/api/file/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'File ID is required' });
        }

        const file = await dbService.getFile(id);
        
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        console.log(file);
        const folder = await dbService.getFolder(file.path_id);
        
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const filePath = path.join(folder.path, file.sub_path || '.', file.filename);
        const content = await fs.readFile(filePath, 'utf8');
        
        res.json({ content });
    } catch (error) {
        console.error('Error getting file content:', error);
        res.status(500).json({ error: 'Failed to get file content' });
    }
});

// API endpoint to add a bookmark
app.post('/api/bookmark', async (req, res) => {
    try {
        const { error, value } = bookmarkCreateSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        let finalTitle = value.title;
        if (!value.title && value.codeLocation) {
            const file = await dbService.getFile(value.codeLocation.file_id);
            if (file) {
                const folder = await dbService.getFolder(file.path_id);
                if (folder) {
                    const filePath = path.join(folder.path, file.sub_path || '.', file.filename);
                    const nodeInfo = await fileService.getNodeLineNumber(filePath, value.codeLocation.type, value.codeLocation.start);
                    if (nodeInfo) {
                        finalTitle = `Line ${nodeInfo.lineNumber}: ${nodeInfo.lineContent}`;
                    }
                }
            }
        }

        if (!finalTitle) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const bookmarkId = await dbService.addBookmark({
            ...value,
            title: finalTitle,
            parent_id: value.parent_id ?? null
        });
        res.json({ id: bookmarkId });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        res.status(500).json({ error: 'Failed to add bookmark' });
    }
});

// API endpoint to delete a bookmark
app.delete('/api/bookmark/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Bookmark ID is required' });
        }

        await dbService.deleteBookmark(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting bookmark:', error);
        res.status(500).json({ error: 'Failed to delete bookmark' });
    }
});

// API endpoint to get all bookmarks
app.get('/api/bookmarks', async (req, res) => {
    try {
        const bookmarks = await dbService.listBookmarks();
        res.json(bookmarks);
    } catch (error) {
        console.error('Error getting bookmarks:', error);
        res.status(500).json({ error: 'Failed to get bookmarks' });
    }
});

// API endpoint to add a folder
app.post('/api/folders', async (req, res) => {
    try {
        const { path } = req.body;
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        await dbService.addFolder(path);
        const folders = await dbService.getFolders();
        res.json(folders.map(folder => ({
            id: folder._id,
            path: folder.path
        })));
    } catch (error) {
        console.error('Error adding folder:', error);
        res.status(500).json({ error: 'Failed to add folder' });
    }
});

app.put('/api/bookmark/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ error: 'Bookmark ID is required' });
        }

        const { error, value } = bookmarkUpdateSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        await dbService.updateBookmark(id, value);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating bookmark:', error);
        res.status(500).json({ error: 'Failed to update bookmark' });
    }
});

app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
}); 
const Datastore = require('nedb');
const path = require('path');
const { globSync } = require('glob');

class DatabaseService {
    constructor(dbPath) {
        // Initialize folders database
        this.folders = new Datastore({
            filename: path.join(dbPath, 'folders.db'),
            autoload: true
        });

        // Initialize files database
        this.files = new Datastore({
            filename: path.join(dbPath, 'files.db'),
            autoload: true
        });

        // Initialize bookmarks database
        this.bookmarks = new Datastore({
            filename: path.join(dbPath, 'bookmarks.db'),
            autoload: true
        });

        this.graphNodes = new Datastore({
            filename: path.join(dbPath, 'graphNodes.db'),
            autoload: true
        });

        this.graphLinks = new Datastore({
            filename: path.join(dbPath, 'graphLinks.db'),
            autoload: true
        });

        // Create indexes
        this.folders.ensureIndex({ fieldName: 'path', unique: true });
        this.files.ensureIndex({ fieldName: 'path_id' });
        this.files.ensureIndex({ fieldName: 'sub_path' });
        this.files.ensureIndex({ fieldName: 'filename' });
        this.bookmarks.ensureIndex({ fieldName: 'file_id' });
        this.bookmarks.ensureIndex({ fieldName: 'type' });
        this.bookmarks.ensureIndex({ fieldName: 'start' });
        this.graphNodes.ensureIndex({ fieldName: 'uuid', unique: true });
        this.graphLinks.ensureIndex({ fieldName: 'order' });
    }

    addFolder(folderPath) {
        return new Promise((resolve, reject) => {
            // Insert folder
            this.folders.insert({ path: folderPath }, (err, newFolder) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Get all files in the folder
                const files = globSync('**/*', {
                    cwd: folderPath,
                    nodir: true,
                    absolute: false,
                    posix: true,
                });

                // Insert files
                const fileDocs = files.map(file => {
                    const dir = path.dirname(file);
                    return {
                        path_id: newFolder._id,
                        sub_path: dir === '.' ? '' : dir,
                        filename: path.basename(file)
                    };
                });

                this.files.insert(fileDocs, (err, newFiles) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    // Helper method to promisify NeDB operations
    promisify(operation) {
        return new Promise((resolve, reject) => {
            operation((err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    // Method to get all folders
    async getFolders() {
        return this.promisify(cb => this.folders.find({}, cb));
    }

    // Method to get a single folder by id
    async getFolder(id) {
        return this.promisify(cb => this.folders.findOne({ _id: id }, cb));
    }

    // Method to get all files in a folder
    async getFolderFiles(folderId) {
        return this.promisify(cb => this.files.find({ path_id: folderId }, cb));
    }

    // Method to get a single file by id
    async getFile(id) {
        return this.promisify(cb => this.files.findOne({ _id: id }, cb));
    }

    // Method to add a bookmark
    async addBookmark(bookmarkData) {
        return this.promisify(cb => this.bookmarks.insert({
            ...bookmarkData,
            parent_id: bookmarkData.parent_id ?? null,
            status: 'new',
            created_at: new Date()
        }, cb));
    }

    // Method to update a bookmark
    async updateBookmark(id, updates) {
        return this.promisify(cb => this.bookmarks.update(
            { _id: id },
            { $set: updates },
            {},
            cb
        ));
    }

    // Method to delete a bookmark
    async deleteBookmark(id) {
        // Обновляем parent_id у дочерних закладок на parent_id удаляемой закладки
        const bookmark = await this.promisify(cb => this.bookmarks.findOne({ _id: id }, cb));
        if (bookmark) {
            // Находим максимальный order_id среди закладок с тем же parent_id
            const siblings = await this.promisify(cb => this.bookmarks.find({ parent_id: bookmark.parent_id }, cb));
            const maxOrder = Math.max(...siblings.map(b => b.order_id || 0), -1);
            
            // Находим все дочерние закладки, отсортированные по order_id
            const children = await this.promisify(cb => this.bookmarks.find({ parent_id: id }).sort({ order_id: 1 }).exec(cb));
            
            // Обновляем каждую дочернюю закладку с уникальным order_id
            for (let i = 0; i < children.length; i++) {
                await this.promisify(cb => this.bookmarks.update(
                    { _id: children[i]._id },
                    { $set: { 
                        parent_id: bookmark.parent_id,
                        order_id: maxOrder + 1 + i
                    } },
                    {},
                    cb
                ));
            }
        }
        
        // Удаляем саму закладку
        return this.promisify(cb => this.bookmarks.remove({ _id: id }, cb));
    }

    // Method to get all bookmarks
    async listBookmarks() {
        return this.promisify(cb => this.bookmarks.find({}, cb));
    }

    async getBookmarksByParent(parent_id = null) {
        return this.promisify(cb => this.bookmarks.find({ parent_id }, cb));
    }

    /** Семантика графа: узлы без поля `_id`, связи как массивы [from, to] или [from, to, info]. */
    async getGraphSemantic() {
        const nodeRows = await this.promisify((cb) => this.graphNodes.find({}).sort({ uuid: 1 }).exec(cb));
        const linkRows = await this.promisify((cb) => this.graphLinks.find({}).sort({ order: 1 }).exec(cb));
        const nodes = nodeRows.map(({ _id, ...n }) => n);
        const links = linkRows.map(({ from, to, info }) =>
            info !== undefined ? [from, to, info] : [from, to],
        );
        return { nodes, links };
    }

    /**
     * Полная замена графа в БД (как при сохранении из UI).
     * @param {{ nodes: object[], links: any[][] }} payload
     */
    async replaceGraphSemantic({ nodes, links }) {
        await this.promisify((cb) => this.graphNodes.remove({}, { multi: true }, cb));
        await this.promisify((cb) => this.graphLinks.remove({}, { multi: true }, cb));
        if (nodes.length > 0) {
            const cleanNodes = nodes.map((n) => {
                const { _id, ...rest } = n;
                return rest;
            });
            await this.promisify((cb) => this.graphNodes.insert(cleanNodes, cb));
        }
        if (links.length > 0) {
            const linkDocs = links.map((link, order) => {
                const [from, to, ...rest] = link;
                const doc = { from, to, order };
                if (rest.length >= 1) {
                    doc.info = rest.length === 1 ? rest[0] : rest;
                }
                return doc;
            });
            await this.promisify((cb) => this.graphLinks.insert(linkDocs, cb));
        }
    }
}

module.exports = DatabaseService; 
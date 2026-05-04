const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs').promises;
const path = require('path');

class FileService {
    async getNodeLineNumber(filePath, type, start) {
        const content = await fs.readFile(filePath, 'utf8');
        const ast = parse(content, {
            sourceType: 'module',
            plugins: ['jsx']
        });

        let targetNode = null;
        traverse(ast, {
            enter(path) {
                if (path.node.start === start && path.node.type === type) {
                    targetNode = path.node;
                    path.stop();
                }
            }
        });

        if (!targetNode) {
            return null;
        }

        const lines = content.split('\n');
        const lineNumber = targetNode.loc.start.line;
        const lineContent = lines[lineNumber - 1].trim();

        return {
            lineNumber,
            lineContent
        };
    }
}

module.exports = FileService; 
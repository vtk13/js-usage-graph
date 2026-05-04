import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { parse } from '@babel/parser';
import _ from 'lodash';
import FileTree from './components/FileTree';
import BookmarksList from './components/BookmarksList';
import GraphExperiment from './components/GraphExperiment';
import { BookmarksProvider, useBookmarks } from './context/BookmarksContext';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import './index.css';

const AppContent = () => {
    const [code, setCode] = useState('');
    const [nodes, setNodes] = useState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [currentFileId, setCurrentFileId] = useState(null);
    const [activeMode, setActiveMode] = useState('graph');
    const editorRef = useRef(null);
    const { bookmarks, addBookmark, deleteBookmark } = useBookmarks();

    const handleHighlightRef = (element) => {
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const handleCursorPositionChange = (code, position, type) => {
        try {
            const ast = parse(code, {
                sourceType: 'module',
                plugins: ['jsx']
            });

            const foundNodes = [];
            const traverse = (node) => {
                if (node.start <= position && node.end >= position) {
                    foundNodes.push(node);
                }
                
                Object.keys(node).forEach(key => {
                    if (node[key] && typeof node[key] === 'object') {
                        traverse(node[key]);
                    }
                });
            };

            traverse(ast);
            setNodes(foundNodes);
            setSelectedNode(_.find(foundNodes, { type, start: position }) || _.last(foundNodes));
        } catch (error) {
            console.error('Error parsing code:', error);
            setNodes([]);
            setSelectedNode(null);
        }
    };

    const handleEditorClick = (e) => {
        const editor = editorRef.current;
        const selection = window.getSelection();
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editor);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        const cursorPosition = preCaretRange.toString().length;

        handleCursorPositionChange(code, cursorPosition);
    };

    const handleFileSelect = (file_id, content) => {
        setCurrentFileId(file_id);
        setCode(content);
        setNodes([]);
        setSelectedNode(null);
    };

    const renderHighlightedText = () => {
        if (!selectedNode) return code;

        const before = code.slice(0, selectedNode.start);
        const highlighted = code.slice(selectedNode.start, selectedNode.end);
        const after = code.slice(selectedNode.end);

        return (
            <>
                {before}
                <span ref={handleHighlightRef} className="highlight">{highlighted}</span>
                {after}
            </>
        );
    };

    const handleNodeClick = (node) => {
        setSelectedNode(node);
    };

    const handleBookmarkClick = async (node) => {
        if (!currentFileId) return;

        const existingBookmark = bookmarks.find(
            b => b.codeLocation?.file_id === currentFileId && 
                 b.codeLocation?.type === node.type && 
                 b.codeLocation?.start === node.start
        );

        if (existingBookmark) {
            try {
                await deleteBookmark(existingBookmark._id);
            } catch (error) {
                console.error('Error deleting bookmark:', error);
            }
        } else {
            try {
                await addBookmark({
                    codeLocation: {
                        file_id: currentFileId,
                        type: node.type,
                        start: node.start
                    }
                });
            } catch (error) {
                console.error('Error adding bookmark:', error);
            }
        }
    };

    const gotoBookmark = async (bookmark) => {
        try {
            const file = await fetch(`/api/file/${bookmark.codeLocation.file_id}`).then(res => res.json());
            setCurrentFileId(bookmark.codeLocation.file_id);
            setCode(file.content);
            setActiveMode('files');
            handleCursorPositionChange(file.content, bookmark.codeLocation.start, bookmark.codeLocation.type);
        } catch (error) {
            console.error('Error loading bookmarked file:', error);
        }
    };

    return (
        <div className="app">
            <div className="mode-icons">
                <i
                    className={`pi pi-sitemap mode-icon ${activeMode === 'graph' ? 'active' : ''}`}
                    onClick={() => setActiveMode('graph')}
                    title="Graph"
                />
                <i
                    className={`pi pi-folder mode-icon ${activeMode === 'files' ? 'active' : ''}`}
                    onClick={() => setActiveMode('files')}
                />
                <i
                    className={`pi pi-bookmark mode-icon ${activeMode === 'bookmarks' ? 'active' : ''}`}
                    onClick={() => setActiveMode('bookmarks')}
                />
            </div>
            {activeMode === 'bookmarks' && (
                <>
                    <h2 className="bookmarks-header">Bookmarks</h2>
                    <BookmarksList onGotoBookmark={gotoBookmark} />
                </>
            )}
            {activeMode === 'graph' && (
                <>
                    <h2 className="graph-view-header">Graph</h2>
                    <div className="graph-view-panel">
                        <GraphExperiment />
                    </div>
                </>
            )}
            {activeMode === 'files' && (
                <>
                    <h2>Project Files</h2>
                    <FileTree onFileSelect={handleFileSelect} />
                    <h2>JavaScript Code</h2>
                    <div
                        ref={editorRef}
                        className="editor"
                        onClick={handleEditorClick}
                    >
                        {renderHighlightedText()}
                    </div>
                    <h2>AST Nodes</h2>
                    <div className="nodes-list">
                        {nodes.map((node, index) => {
                            const isBookmarked = bookmarks.some(
                                b => b.codeLocation?.file_id === currentFileId && 
                                     b.codeLocation?.type === node.type && 
                                     b.codeLocation?.start === node.start
                            );
                            return (
                                <div
                                    key={index}
                                    className={`node-item ${selectedNode === node ? 'selected' : ''}`}
                                    onClick={() => handleNodeClick(node)}
                                >
                                    <div className="node-type">{node.type}</div>
                                    <i
                                        className={`pi ${isBookmarked ? 'pi-bookmark-fill' : 'pi-bookmark'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleBookmarkClick(node);
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                    <h2>Node Details</h2>
                    <pre className="node-details">
                        {selectedNode ? JSON.stringify(selectedNode, null, 2) : 'Click on a node to see details'}
                    </pre>
                </>
            )}
        </div>
    );
};

const App = () => {
    return (
        <BookmarksProvider>
            <AppContent />
        </BookmarksProvider>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
); 
import React, { useState, useEffect } from 'react';
import { Tree } from 'primereact/tree';
import { Button } from 'primereact/button';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';

const FileTree = ({ onFileSelect }) => {
    const [folders, setFolders] = useState([]);

    const loadFolders = async () => {
        try {
            const response = await fetch('/api/folders');
            const data = await response.json();
            const folderNodes = data.map(folder => ({
                key: folder.id,
                label: folder.path.split(/[\\/]/).pop(),
                icon: 'pi pi-folder',
                leaf: false,
                data: {
                    folder_id: folder.id,
                    sub_path: ''
                }
            }));
            setFolders(folderNodes);
        } catch (error) {
            console.error('Error fetching folders:', error);
        }
    };

    useEffect(() => {
        loadFolders();
    }, []);

    const loadNode = async (node) => {
        const { folder_id, sub_path } = node.data;

        try {
            const response = await fetch(`/api/files?folder_id=${folder_id}&sub_path=${encodeURIComponent(sub_path)}`);
            const data = await response.json();
            
            return data.map(item => ({
                key: `${folder_id}/${sub_path}/${item.filename}`,
                label: item.filename,
                icon: item.type === 'folder' ? 'pi pi-folder' : 'pi pi-file',
                leaf: item.type === 'file',
                data: {
                    folder_id,
                    sub_path: item.sub_path,
                    filename: item.filename,
                    file_id: item.file_id
                },
                className: item.type === 'file' && !item.filename.endsWith('.js') ? 'p-disabled' : ''
            }));
        } catch (error) {
            console.error('Error loading node:', error);
            return [];
        }
    };

    const loadFileContent = async (node) => {
        const { file_id } = node.data;

        try {
            const response = await fetch(`/api/file/${file_id}`);
            const data = await response.json();
            return data.content;
        } catch (error) {
            console.error('Error loading file content:', error);
            return '';
        }
    };

    const handleAddFolder = async () => {
        const folderPath = window.prompt('Enter folder path:');
        if (!folderPath) return;

        try {
            const response = await fetch('/api/folders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ path: folderPath })
            });
            const data = await response.json();
            console.log('Folders:', data);
            loadFolders();
        } catch (error) {
            console.error('Error adding folder:', error);
        }
    };

    return (
        <div className="tree-container">
            <div className="flex justify-content-end mb-2">
                <Button
                    icon="pi pi-folder-plus"
                    title="Add folder"
                    onClick={handleAddFolder}
                    className="p-button-text"
                />
            </div>
            <Tree
                value={folders}
                selectionMode="single"
                onSelect={async (e) => {
                    if (e.node && e.node.data && e.node.leaf) {
                        const content = await loadFileContent(e.node);
                        onFileSelect(e.node.data.file_id, content);
                    }
                }}
                onExpand={async (e) => {
                    if (!e.node.children) {
                        const children = await loadNode(e.node);
                        e.node.children = children;
                        setFolders([...folders]);
                    }
                }}
                pt={{
                    root: { style: { padding: '0' } },
                    container: { style: { padding: '0' } },
                    node: { style: { padding: '2px' } },
                    content: { style: { padding: '2px' } }
                }}
            />
        </div>
    );
};

export default FileTree; 

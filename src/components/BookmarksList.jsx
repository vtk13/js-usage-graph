import React, { useState } from 'react';
import { Tree } from 'primereact/tree';
import { InputText } from 'primereact/inputtext';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { useBookmarks } from '../context/BookmarksContext';

const BookmarksList = ({ onGotoBookmark }) => {
    const { bookmarks, addBookmark, updateBookmark, deleteBookmark } = useBookmarks();
    const [selectedNode, setSelectedNode] = useState(null);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newBookmark, setNewBookmark] = useState({
        title: '',
        comment: ''
    });
    const [isAddingChild, setIsAddingChild] = useState(false);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'new':
                return 'pi pi-stop';
            case 'inprogress':
                return 'pi pi-clock';
            case 'done':
                return 'pi pi-check-square';
            default:
                return 'pi pi-stop';
        }
    };

    const getNextStatus = (currentStatus) => {
        const statusOrder = ['new', 'inprogress', 'done'];
        const currentIndex = statusOrder.indexOf(currentStatus);
        return statusOrder[(currentIndex + 1) % statusOrder.length];
    };

    const handleAddBookmark = async () => {
        try {
            const parent_id = isAddingChild ? selectedNode?.key : null;

            if (!newBookmark.title) {
                return;
            }

            await addBookmark({
                title: newBookmark.title,
                comment: newBookmark.comment,
                parent_id
            });
            setShowAddDialog(false);
            setNewBookmark({ title: '', comment: '' });
            setIsAddingChild(false);
        } catch (error) {
            console.error('Error adding bookmark:', error);
        }
    };

    const handleUpdateBookmark = async () => {
        try {
            if (!selectedNode || !newBookmark.title) {
                return;
            }

            await updateBookmark(selectedNode.key, { 
                title: newBookmark.title, 
                comment: newBookmark.comment 
            });
            setShowAddDialog(false);
            setNewBookmark({ title: '', comment: '' });
            setSelectedNode(null);
        } catch (error) {
            console.error('Error updating bookmark:', error);
        }
    };

    const handleDeleteBookmark = async (bookmarkId) => {
        try {
            await deleteBookmark(bookmarkId);
        } catch (error) {
            console.error('Error deleting bookmark:', error);
        }
    };

    const handleToggleStatus = async (e, node) => {
        e.stopPropagation();
        try {
            const nextStatus = getNextStatus(node.data.status);
            await updateBookmark(node.key, { status: nextStatus });
        } catch (error) {
            console.error('Error toggling bookmark status:', error);
        }
    };

    const handleDragDrop = async (e) => {
        const { dragNode, dropNode, dropIndex } = e;
        
        try {
            const oldParentId = dragNode.data.parent_id;
            
            // Обновляем order_id в старом родителе (как будто удалили элемент)
            const oldSiblings = bookmarks.filter(b => 
                b.parent_id == oldParentId && 
                b._id !== dragNode.key && 
                b.order_id > dragNode.data.order_id
            );
            
            for (const bookmark of oldSiblings) {
                await updateBookmark(bookmark._id, {
                    order_id: bookmark.order_id - 1
                });
            }

            const newParentId = dropNode?.key || null;
            // Обновляем order_id в новом родителе (как будто вставили элемент)
            const newSiblings = bookmarks.filter(b => 
                b.parent_id == newParentId && 
                b._id !== dragNode.key && 
                b.order_id >= dropIndex
            );
            
            for (const bookmark of newSiblings) {
                await updateBookmark(bookmark._id, {
                    order_id: bookmark.order_id + 1
                });
            }

            // Обновляем саму перетаскиваемую закладку
            await updateBookmark(dragNode.key, { 
                parent_id: newParentId,
                order_id: dropIndex
            });
        } catch (error) {
            console.error('Error updating bookmark position:', error);
        }
    };

    const buildTree = (bookmarks, parent_id = null) => {
        return bookmarks
            .filter(bookmark => bookmark.parent_id == parent_id)
            .sort((a, b) => (a.order_id || 0) - (b.order_id || 0))
            .map(bookmark => ({
                key: bookmark._id,
                label: bookmark.title || `${bookmark.codeLocation?.type} (File ID: ${bookmark.codeLocation?.file_id})`,
                data: bookmark,
                children: buildTree(bookmarks, bookmark._id)
            }));
    };

    const nodeTemplate = (node) => {
        return (
            <div className={`bookmark-item ${node.data.status === 'done' ? 'done' : ''}`}>
                <div className="bookmark-content">
                    <div className="bookmark-title">
                        <i 
                            className={`${getStatusIcon(node.data.status)} cursor-pointer`}
                            onClick={(e) => handleToggleStatus(e, node)}
                            title={`Status: ${node.data.status}`}
                            style={{ marginRight: '12px' }}
                        />
                        {node.label}
                        {node.data.comment && (
                            <div className="bookmark-comment">{node.data.comment}</div>
                        )}
                    </div>
                    <div className="bookmark-actions">
                        {node.data.codeLocation && (
                            <i 
                                className="pi pi-external-link"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onGotoBookmark(node.data);
                                }}
                                title="Go to bookmark"
                            />
                        )}
                        <i 
                            className="pi pi-plus"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNode(node);
                                setIsAddingChild(true);
                                setNewBookmark({ title: '', comment: '' });
                                setShowAddDialog(true);
                            }}
                            title="Add child bookmark"
                        />
                        <i 
                            className="pi pi-pencil"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedNode(node);
                                setIsAddingChild(false);
                                setNewBookmark({
                                    title: node.data.title || '',
                                    comment: node.data.comment || ''
                                });
                                setShowAddDialog(true);
                            }}
                            title="Edit bookmark"
                        />
                        <i 
                            className="pi pi-trash"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBookmark(node.key);
                            }}
                            title="Delete bookmark"
                        />
                    </div>
                </div>
            </div>
        );
    };

    const footer = (
        <div>
            <Button label="Cancel" icon="pi pi-times" onClick={() => setShowAddDialog(false)} className="p-button-text" />
            <Button 
                label="Save" 
                icon="pi pi-check" 
                onClick={isAddingChild ? handleAddBookmark : (selectedNode ? handleUpdateBookmark : handleAddBookmark)} 
                autoFocus 
            />
        </div>
    );

    return (
        <div className="bookmarks-list">
            <Tree 
                value={buildTree(bookmarks)}
                nodeTemplate={nodeTemplate}
                className="w-full md:w-30rem compact-tree"
                selectionMode="single"
                selectionKeys={selectedNode ? { [selectedNode.key]: true } : null}
                onSelectionChange={e => setSelectedNode(e.value)}
                dragdropScope="bookmarks"
                onDragDrop={handleDragDrop}
                header={
                    <div className="flex justify-content-end">
                        <i 
                            className="pi pi-plus header-icon"
                            style={{ fontSize: '1.5rem' }}
                            onClick={() => {
                                setSelectedNode(null);
                                setIsAddingChild(false);
                                setNewBookmark({ title: '', comment: '' });
                                setShowAddDialog(true);
                            }}
                            title="Add Bookmark"
                        />
                    </div>
                }
            />
            <Dialog 
                header={isAddingChild ? "Add Child Bookmark" : (selectedNode ? "Edit Bookmark" : "Add Bookmark")} 
                visible={showAddDialog} 
                style={{ width: '450px' }} 
                footer={footer}
                onHide={() => setShowAddDialog(false)}
            >
                <div className="p-field">
                    <label htmlFor="title">Title</label>
                    <InputText
                        id="title"
                        value={newBookmark.title}
                        onChange={(e) => setNewBookmark({ ...newBookmark, title: e.target.value })}
                        className="w-full"
                    />
                </div>
                <div className="p-field">
                    <label htmlFor="comment">Comment</label>
                    <InputText
                        id="comment"
                        value={newBookmark.comment}
                        onChange={(e) => setNewBookmark({ ...newBookmark, comment: e.target.value })}
                        className="w-full"
                    />
                </div>
            </Dialog>
        </div>
    );
};

export default BookmarksList; 
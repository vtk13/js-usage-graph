import React, { createContext, useState, useContext, useEffect } from 'react';

const BookmarksContext = createContext();

export const BookmarksProvider = ({ children }) => {
    const [bookmarks, setBookmarks] = useState([]);

    const loadBookmarks = async () => {
        try {
            const response = await fetch('/api/bookmarks');
            const data = await response.json();
            setBookmarks(data);
        } catch (error) {
            console.error('Error loading bookmarks:', error);
        }
    };

    const addBookmark = async (bookmarkData) => {
        try {
            // Находим максимальный order_id среди закладок с тем же parent_id
            const siblings = bookmarks.filter(b => b.parent_id == bookmarkData.parent_id);
            const maxOrder = Math.max(...siblings.map(b => b.order_id || 0), -1);
            
            const response = await fetch('/api/bookmark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...bookmarkData,
                    order_id: maxOrder + 1
                })
            });
            await loadBookmarks();
            return response.json();
        } catch (error) {
            console.error('Error adding bookmark:', error);
            throw error;
        }
    };

    const updateBookmark = async (id, updates) => {
        try {
            await fetch(`/api/bookmark/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            await loadBookmarks();
        } catch (error) {
            console.error('Error updating bookmark:', error);
            throw error;
        }
    };

    const deleteBookmark = async (id) => {
        try {
            await fetch(`/api/bookmark/${id}`, { method: 'DELETE' });
            await loadBookmarks();
        } catch (error) {
            console.error('Error deleting bookmark:', error);
            throw error;
        }
    };

    useEffect(() => {
        loadBookmarks();
    }, []);

    const value = {
        bookmarks,
        loadBookmarks,
        addBookmark,
        updateBookmark,
        deleteBookmark
    };

    return (
        <BookmarksContext.Provider value={value}>
            {children}
        </BookmarksContext.Provider>
    );
};

export const useBookmarks = () => {
    const context = useContext(BookmarksContext);
    if (!context) {
        throw new Error('useBookmarks must be used within a BookmarksProvider');
    }
    return context;
}; 
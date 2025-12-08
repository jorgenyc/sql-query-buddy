// Memory Manager - Handles multiple BufferMemory instances per tab
import { BufferMemory } from 'langchain/memory';
import logger from './logger.js';

class MemoryManager {
    constructor() {
        // Map of tabId -> BufferMemory instance
        this.memories = new Map();
        
        // Maximum conversation history messages per tab
        this.MAX_HISTORY_MESSAGES = 10;
    }

    /**
     * Get or create a memory instance for a specific tab
     * @param {string} tabId - The tab identifier
     * @param {boolean} createNew - If true, creates a fresh memory even if one exists
     * @returns {BufferMemory} The memory instance for this tab
     */
    getMemory(tabId, createNew = false) {
        if (!tabId) {
            logger.warn('[MEMORY] No tabId provided, using default');
            tabId = 'default';
        }

        // If createNew is true, clear existing memory and create fresh
        if (createNew && this.memories.has(tabId)) {
            logger.info(`[MEMORY] Clearing existing memory for tab: ${tabId}`);
            this.memories.delete(tabId);
        }

        // Get or create memory instance
        if (!this.memories.has(tabId)) {
            logger.info(`[MEMORY] Creating new memory instance for tab: ${tabId}`);
            const memory = new BufferMemory({
                memoryKey: 'chat_history',
                returnMessages: true,
                inputKey: 'input',
            });
            this.memories.set(tabId, memory);
        }

        return this.memories.get(tabId);
    }

    /**
     * Clear memory for a specific tab
     * @param {string} tabId - The tab identifier
     */
    async clearMemory(tabId) {
        if (!tabId) {
            logger.warn('[MEMORY] No tabId provided for clearMemory');
            return;
        }

        if (this.memories.has(tabId)) {
            logger.info(`[MEMORY] Clearing memory for tab: ${tabId}`);
            const memory = this.memories.get(tabId);
            await memory.clear();
        } else {
            logger.info(`[MEMORY] No memory found for tab: ${tabId}, nothing to clear`);
        }
    }

    /**
     * Delete memory instance for a tab (when tab is closed)
     * @param {string} tabId - The tab identifier
     */
    deleteMemory(tabId) {
        if (this.memories.has(tabId)) {
            logger.info(`[MEMORY] Deleting memory instance for tab: ${tabId}`);
            this.memories.delete(tabId);
        }
    }

    /**
     * Get all active tab IDs that have memory
     * @returns {string[]} Array of tab IDs
     */
    getActiveTabIds() {
        return Array.from(this.memories.keys());
    }

    /**
     * Cleanup stale memories (for tabs that no longer exist)
     * @param {string[]} activeTabIds - Array of currently active tab IDs
     */
    cleanupStaleMemories(activeTabIds) {
        const activeSet = new Set(activeTabIds);
        for (const tabId of this.memories.keys()) {
            if (!activeSet.has(tabId) && tabId !== 'default') {
                logger.info(`[MEMORY] Cleaning up stale memory for tab: ${tabId}`);
                this.memories.delete(tabId);
            }
        }
    }

    /**
     * Get the maximum history messages limit
     * @returns {number}
     */
    getMaxHistoryMessages() {
        return this.MAX_HISTORY_MESSAGES;
    }
}

// Singleton instance
const memoryManager = new MemoryManager();

export default memoryManager;


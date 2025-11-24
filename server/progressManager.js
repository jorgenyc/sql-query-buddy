// Progress Manager - Handles SSE connections and progress updates
class ProgressManager {
    constructor() {
        // Map of requestId -> { res, lastUpdate }
        this.connections = new Map();

        // Map of requestId -> { status, steps, result }
        this.requestStates = new Map();

        // Cleanup stale connections every 5 minutes
        this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
    }

    // Register a new SSE connection
    registerConnection(requestId, res) {
        this.connections.set(requestId, {
            res,
            lastUpdate: Date.now()
        });

        // Initialize request state
        this.requestStates.set(requestId, {
            status: 'pending',
            steps: [],
            result: null
        });

        // Send initial connection confirmation
        this.sendEvent(requestId, 'connected', {
            requestId,
            timestamp: new Date().toISOString(),
            message: 'Progress stream established'
        });
    }

    // Send a progress update
    sendProgress(requestId, step, totalSteps, message, stepStartTime) {
        const now = Date.now();
        const stepDuration = stepStartTime ? now - stepStartTime : 0;

        const data = {
            requestId,
            step,
            totalSteps,
            message,
            stepDuration, // Add duration in milliseconds
            timestamp: new Date().toISOString(),
            status: 'in_progress'
        };

        // Store step in request state
        const state = this.requestStates.get(requestId);
        if (state) {
            state.steps.push(data);
        }

        this.sendEvent(requestId, 'progress', data);

        // Rich progress indicator for the terminal
        const progressBarWidth = Math.floor(process.stdout.columns * 0.2);
        const completedWidth = Math.round(progressBarWidth * (step / totalSteps));
        const remainingWidth = progressBarWidth - completedWidth;

        const progressBar = `[${'#'.repeat(completedWidth)}${'-'.repeat(remainingWidth)}]`;
        const stepTime = `(${(stepDuration / 1000).toFixed(2)}s)`;

        console.log(` ${progressBar} ${message} ${stepTime}`);
    }

    // Send completion event
    sendComplete(requestId, result) {
        const state = this.requestStates.get(requestId);
        let totalTime = 0;

        if (state) {
            totalTime = state.steps.reduce((acc, s) => acc + s.stepDuration, 0);
            console.log(`\nTotal Time: ${(totalTime / 1000).toFixed(2)}s\n`);
        }

        const data = {
            requestId,
            status: 'success',
            timestamp: new Date().toISOString(),
            result: {
                ...result,
                totalTime, // Add total time in milliseconds
            }
        };

        // Update request state
        if (state) {
            state.status = 'complete';
            state.result = result;
        }

        this.sendEvent(requestId, 'complete', data);
        this.closeConnection(requestId);
    }

    // Send error event
    sendError(requestId, step, message, error) {
        const data = {
            requestId,
            step,
            message,
            error: error.message || error,
            timestamp: new Date().toISOString(),
            status: 'failed'
        };

        // Update request state
        const state = this.requestStates.get(requestId);
        if (state) {
            state.status = 'error';
            state.result = data;
        }

        this.sendEvent(requestId, 'error', data);
        this.closeConnection(requestId);
    }

    // Send generic SSE event
    sendEvent(requestId, eventType, data) {
        const connection = this.connections.get(requestId);
        if (!connection) {
            console.warn(`No connection found for requestId: ${requestId}`);
            return;
        }

        const { res } = connection;

        // Check if response is still writable
        if (!res.writable) {
            console.warn(`Response not writable for requestId: ${requestId}`);
            this.closeConnection(requestId);
            return;
        }

        try {
            // SSE format: event: <type>\ndata: <json>\n\n
            res.write(`event: ${eventType}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);

            // Update last update time
            connection.lastUpdate = Date.now();
        } catch (error) {
            console.error(`Error sending SSE event for ${requestId}:`, error);
            this.closeConnection(requestId);
        }
    }

    // Send heartbeat to keep connection alive
    sendHeartbeat(requestId) {
        this.sendEvent(requestId, 'heartbeat', {
            timestamp: new Date().toISOString()
        });
    }

    // Close and cleanup connection
    closeConnection(requestId) {
        const connection = this.connections.get(requestId);
        if (connection) {
            try {
                connection.res.end();
            } catch (error) {
                console.error(`Error closing connection for ${requestId}:`, error);
            }
            this.connections.delete(requestId);
        }

        // Keep request state for 5 minutes for potential reconnection
        setTimeout(() => {
            this.requestStates.delete(requestId);
        }, 300000);
    }

    // Check if request is active
    isActive(requestId) {
        return this.connections.has(requestId);
    }

    // Get request state (for reconnection scenarios)
    getRequestState(requestId) {
        return this.requestStates.get(requestId);
    }

    // Cleanup stale connections
    cleanup() {
        const now = Date.now();
        const timeout = 300000; // 5 minutes

        for (const [requestId, connection] of this.connections.entries()) {
            if (now - connection.lastUpdate > timeout) {
                console.log(`Cleaning up stale connection: ${requestId}`);
                this.closeConnection(requestId);
            }
        }
    }

    // Shutdown - cleanup all connections
    shutdown() {
        clearInterval(this.cleanupInterval);
        for (const requestId of this.connections.keys()) {
            this.closeConnection(requestId);
        }
    }
}

// Singleton instance
const progressManager = new ProgressManager();

// Cleanup on process exit
process.on('SIGINT', () => {
    progressManager.shutdown();
    process.exit(0);
});

export default progressManager;

// @flow

/**
 * Exception for missing data.
 */
class MissingDataError extends Error {
    message: string;
    name: string;

    /**
     * Constructor
     *
     * @param {string} message - Error message
     */
    constructor(message: string) {
        super(message);
        this.message = message;
        this.name = 'MissingDataError';
    }
}

export default MissingDataError;

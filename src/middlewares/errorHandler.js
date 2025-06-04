const notFoundHandler = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    error.status = 404;
    next(error);
};

const generalErrorHandler = (error, req, res, next) => {
    const statusCode = error.status || 500;
    console.error(`[${statusCode}] ${error.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    console.error(error.stack); 

    res.status(statusCode).json({
        error: {
            message: error.message,
            // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined, // Optionally show stack in dev
        },
    });
};

module.exports = { notFoundHandler, generalErrorHandler };

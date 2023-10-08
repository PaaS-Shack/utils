"use strict";

const { Resolver } = require('dns').promises;
const Errors = require("moleculer").Errors;
// error types
const {
    MoleculerClientError,
    MoleculerServerError,
    MoleculerRetryableError,
    MoleculerConflictDataError,
} = Errors;

const DbService = require("db-mixin");
const ConfigLoader = require("config-mixin");

/**
 * Lock service for distributed locking
 */
module.exports = {
    // name of service
    name: "utils.lock",
    // version of service
    version: 1,

    /**
     * Service Mixins
     * 
     * @type {Array}
     * @property {ConfigLoader} ConfigLoader - Config loader mixin
     * 
     */
    mixins: [
        ConfigLoader([
            'lock.**'
        ]),
    ],

    /**
     * Service dependencies
     */
    dependencies: [],

    /**
     * Service settings
     * 
     * @type {Object}
     */
    settings: {
        rest: true,

        // default init config settings
        config: {

        }
    },

    /**
     * service actions
     */
    actions: {
        /**
         * Acquire a lock
         * 
         * @actions
         * @param {String} key - Key of lock
         * @param {Number} ttl - Time to live in milliseconds
         * 
         * @returns {Promise} Promise of lock
         */
        acquire: {
            params: {
                key: { type: "string" },
                ttl: { type: "number", optional: true, default: 10000 },
            },
            async handler(ctx) {
                return this.acquire(ctx.params.key, ctx.params.ttl);
            }
        },

        /**
         * Release a lock
         * 
         * @actions
         * @param {String} key - Key of lock
         * 
         * @returns {Promise} Promise of lock
         */
        release: {
            params: {
                key: { type: "string" },
            },
            async handler(ctx) {
                return this.release(ctx.params.key);
            }
        },

        /**
         * Check for expired locks
         * 
         * @actions
         * 
         * @returns {Promise} Promise of lock
         */
        check: {
            async handler(ctx) {
                return this.check();
            }
        },

        /**
         * How many are waitng for lock
         * 
         * @actions
         * @param {String} key - Key of lock
         * 
         * @returns {Promise} Promise of lock
         */
        waiting: {
            params: {
                key: { type: "string" },
            },
            async handler(ctx) {
                return this.waiting(ctx.params.key);
            }
        }
    },

    /**
     * service events
     */
    events: {

    },

    /**
     * service methods
     */
    methods: {
        /**
         * Acquire a lock
         * 
         * @param {String} key - Key of lock
         * @param {Number} ttl - Time to live in milliseconds
         * 
         * @returns {Promise} Promise of lock
         */
        async acquire(key, ttl) {
            let locked = this.locked.get(key);
            if (!locked) { // not locked
                locked = [];
                this.locked.set(key, locked);
                return Promise.resolve();
            } else {
                // ttl for lock timeout
                const timeout = Date.now() + ttl;

                // wait for lock
                return new Promise((resolve, reject) => {
                    // add lock to queue
                    locked.push({ resolve, reject, timeout });
                });
            }
        },

        /**
         * Release a lock
         * 
         * @param {String} key - Key of lock
         * 
         * @returns {Promise} Promise of lock
         */
        async release(key) {
            let locked = this.locked.get(key);
            if (locked) {
                const lock = locked.shift();
                if (lock) {
                    lock.resolve();
                } else {
                    this.locked.delete(key);
                }
            }
            return Promise.resolve();
        },

        /**
         * Check for expired locks
         * 
         * @returns {Promise} Promise of lock
         */
        async check() {
            const now = Date.now();
            for (let [key, locked] of this.locked) {
                const lock = locked[0];
                console.log(locked)
                if (lock && lock.timeout < now) {
                    this.logger.error(`Lock timeout for ${key}`)
                    locked.shift();
                    if(locked.length == 0) {
                        this.locked.delete(key);
                    }
                    lock.reject(new Error('Lock timeout'));
                }
            }
            return Promise.resolve();
        },

        /**
         * How many are waitng for lock
         * 
         * @param {String} key - Key of lock
         * 
         * @returns {Promise} Promise of lock
         */
        async waiting(key) {
            const locked = this.locked.get(key);
            if (locked) {
                return locked.length;
            } else {
                return 0;
            }
        }
    },

    /**
     * created lifecycle event handler
     */
    created() {
        this.locked = new Map();
    },

    /**
     * started lifecycle event handler
     */
    async started() {
        this.interval = setInterval(() => {
            this.check();
        }, 1000);
     },

    /**
     * stopped lifecycle event handler
     */
    async stopped() { 
        clearInterval(this.interval);
    },
};
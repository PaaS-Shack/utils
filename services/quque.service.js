const DbService = require("db-mixin");
const Membership = require("membership-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;

/**
 * Quque service
 * quques are based of quque names
 * quques are used to store ids to be processed
 * quques use one collection in the database
 * 
 * atmic lock is used to ensure only one process can access a quque at a time
 * v1.utils.lock
 * 
 */

module.exports = {
    // name of service
    name: "utils.quque",
    // version of service
    version: 1,

    /**
     * Service Mixins
     * 
     * @type {Array}
     * @property {ConfigLoader} ConfigLoader - Config loader mixin
     * @property {DbService} DbService - Database mixin
     * @property {Membership} Membership - Membership mixin
     */
    mixins: [
        ConfigLoader([
            'utils.quque.**'
        ]),
        DbService({
            permissions: 'utils.quque'
        })
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

        fields: {
            // quque name
            name: {
                type: "string",
                required: true,
            },

            // reference to id
            reference: {
                type: "string",
                required: true,
            },

            // time to live
            ttl: {
                type: "number",
                required: false,
                default: null
            },

            // quque data
            data: {
                type: "object",
                required: false,
                default: {}
            },

            // quque status
            status: {
                type: "string",
                required: false,
                default: "new",
                enum: ["new", "processing", "complete", "error"]
            },

            // quque error
            error: {
                type: "object",
                required: false,
            },


            ...DbService.FIELDS,// inject dbservice fields
        },
        defaultPopulates: [],

        scopes: {
            ...DbService.SCOPE,
        },

        defaultScopes: [
            ...DbService.DSCOPE,
        ],

        // default init config settings
        config: {
            "utils.quque.maxTTL": 86400,// max time to live in seconds
            "utils.quque.defaultTTL": 60,// default time to live in seconds
            "utils.quque.maxConcurrent": 1,// max concurrent quques
        }
    },

    /**
     * service actions
     */
    actions: {
        /**
         * add to quque
         * 
         * @actions
         * @param {String} name - quque name
         * @param {String} reference - id to add to quque
         * 
         * @returns {Object} quque object
         */
        addToQuque: {
            params: {
                name: {
                    type: "string",
                    required: true,
                },
                reference: {
                    type: "string",
                    required: true,
                },
                ttl: {
                    type: "number",
                    required: false,
                    default: 60
                },
                data: {
                    type: "object",
                    required: false,
                    default: {}
                },
            },
            async handler(ctx) {
                return this.addToQuque(ctx, ctx.params.name, ctx.params.reference, ctx.params.ttl, ctx.params.data);
            }
        },
        /**
         * pick item from quque
         * 
         * @actions
         * @param {String} name - quque name
         * 
         * @returns {Object} quque object
         */
        pickFromQuque: {
            params: {
                name: {
                    type: "string",
                    required: true,
                }
            },
            async handler(ctx) {
                return this.pickFromQuque(ctx, ctx.params.name);
            }
        },

        /**
         * peek next item from quque
         * 
         * @actions
         * @param {String} name - quque name
         * 
         * @returns {Object} quque object
         */
        peekFromQuque: {
            params: {
                name: {
                    type: "string",
                    required: true,
                }
            },
            async handler(ctx) {
                return this.peekFromQuque(ctx, ctx.params.name);
            }
        },

        /**
         * mark item as complete
         * 
         * @actions
         * @param {String} id - quque id
         * 
         * @returns {Object} quque object
         */
        markComplete: {
            params: {
                id: {
                    type: "string",
                    required: true,
                }
            },
            async handler(ctx) {
                return this.markComplete(ctx, ctx.params.id);
            }
        },

        /**
         * mark item as error
         * 
         * @actions
         * @param {String} id - quque id
         * @param {Object} error - error object
         * 
         * @returns {Object} quque object
         */
        markError: {
            params: {
                id: {
                    type: "string",
                    required: true,
                },
                error: {
                    type: "object",
                    required: true,
                }
            },
            async handler(ctx) {
                return this.markError(ctx, ctx.params.id, ctx.params.error);
            }
        },

        /**
         * delete item from quque
         * 
         * @actions
         * @param {String} id - quque id
         * 
         * @returns {Object} quque object
         */
        deleteFromQuque: {
            params: {
                id: {
                    type: "string",
                    required: true,
                }
            },
            async handler(ctx) {
                return this.deleteFromQuque(ctx, ctx.params.id);
            }
        },

        /**
         * get quque stats
         * 
         * @actions
         * @param {String} name - quque name
         * 
         * @returns {Object} quque stats
         */
        getQuqueStats: {
            params: {
                name: {
                    type: "string",
                    required: true,
                }
            },
            async handler(ctx) {
                return this.getQuqueStats(ctx, ctx.params.name);
            }
        },
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
         * add to quque
         * 
         * @param {Context} ctx - Moleculer's Context
         * @param {String} name - quque name
         * @param {String} reference - id to add to quque
         * @param {Number} ttl - time to live
         * @param {Object} data - quque data
         * 
         * @returns {Object} quque object
         */
        async addToQuque(ctx, name, reference, ttl, data) {
            return this.createEntity(ctx, {
                name,
                reference,
                ttl,
                data
            });
        },

        /**
         * pick item from quque
         * 
         * @param {Context} ctx - Moleculer's Context
         * @param {String} name - quque name
         * 
         * @returns {Object} quque object
         */
        async pickFromQuque(ctx, name) {

            // count processing items
            const processingCount = await this.countEntities(ctx, {
                query: {
                    name,
                    status: "processing"
                }
            });

            // if processing items is more than max concurrent, return null
            if (processingCount >= this.settings.config["utils.quque.maxConcurrent"]) {
                return null;
            }

            // aquire lock
            await ctx.call('v1.utils.lock.acquire', {
                key: `quque.${name}`
            });

            let pickedItem = await this.findEntity(ctx, {
                query: {
                    name,
                    status: "new"
                },
                sort: 'createdAt',
                limit: 1
            });

            if (!pickedItem) {
                // release lock
                await ctx.call('v1.utils.lock.release', {
                    key: `quque.${name}`
                });
                return null;
            }

            pickedItem = this.updateEntity(ctx, {
                id: pickedItem.id,
                status: "processing"
            });

            // release lock
            await ctx.call('v1.utils.lock.release', {
                key: `quque.${name}`
            });

            return pickedItem;
        },


        /**
         * peek next item from quque
         * 
         * @param {Context} ctx - Moleculer's Context
         * @param {String} name - quque name
         * 
         * @returns {Object} quque object
         */
        async peekFromQuque(ctx, name) {
            return this.findEntity(ctx, {
                query: {
                    name,
                    status: "new"
                },
                sort: 'createdAt',
                limit: 1
            });
        },

        /**
         * mark item as complete
         * 
         * @param {Context} ctx - Moleculer's Context
         * @param {String} id - quque id
         * 
         * @returns {Object} quque object
         */
        async markComplete(ctx, id) {
            return this.updateEntity(ctx, {
                id,
                status: "complete"
            });
        },

        /**
         * mark item as error
         * 
         * @param {Context} ctx - Moleculer's Context
         * @param {String} id - quque id
         * @param {Object} error - error object
         * 
         * @returns {Object} quque object
         */
        async markError(ctx, id, error) {
            return this.updateEntity(ctx, {
                id,
                status: "error",
                error
            });
        },

        /**
         * delete item from quque
         * 
         * @param {Context} ctx - Moleculer's Context
         * @param {String} id - quque id
         * 
         * @returns {Object} quque object
         */
        async deleteFromQuque(ctx, id) {
            return this.removeEntity(ctx, {
                id
            });
        },

        /**
         * get quque stats
         * 
         * @param {Context} ctx - Moleculer's Context
         * @param {String} name - quque name
         * 
         * @returns {Object} quque stats
         */
        async getQuqueStats(ctx, name) {
            const [newCount, processingCount, completeCount, errorCount] = await Promise.all([
                this.countEntities(ctx, {
                    query: {
                        name,
                        status: "new"
                    }
                }),
                this.countEntities(ctx, {
                    query: {
                        name,
                        status: "processing"
                    }
                }),
                this.countEntities(ctx, {
                    query: {
                        name,
                        status: "complete"
                    }
                }),
                this.countEntities(ctx, {
                    query: {
                        name,
                        status: "error"
                    }
                })
            ]);

            return {
                newCount,
                processingCount,
                completeCount,
                errorCount
            };
        },

    },

    /**
     * service created lifecycle event handler
     */
    created() {

    },

    /**
     * service started lifecycle event handler
     */
    async started() {

    },

    /**
     * service stopped lifecycle event handler
     */
    async stopped() {

    }
};
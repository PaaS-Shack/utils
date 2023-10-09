const DbService = require("db-mixin");
const Membership = require("membership-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;

/**
 * Hook service
 * Other services and actions can subscribe to hooks
 * When a hook is triggered, all subscribers will be notified
 * Sync hooks are executed in order, one after the other
 * Async hooks are executed in parallel
 */

module.exports = {
    // name of service
    name: "utils.hooks",
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
            'hooks.**'
        ]),
        DbService({
            permissions: 'utils.hooks'
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

            // hook name
            hook: {
                type: "string",
                required: true,
                unique: true,
                min: 3,
                max: 255,
                trim: true,
                lowercase: true,
                index: true,
                description: "Hook name"
            },

            // service name
            service: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
                trim: true,
                description: "Service name"
            },

            // action name
            action: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
                trim: true,
                description: "Action name"
            },

            // hook type
            type: {
                type: "enum",
                values: ["sync", "async"],
                required: true,
                description: "Hook type"
            },

            // hook description
            description: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
                trim: true,
                description: "Hook description"
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

        }
    },

    /**
     * service actions
     */
    actions: {
        /**
         * Subscribe to a hook
         * 
         * @actions
         * @param {String} hook - Hook name
         * @param {String} service - Service name
         * @param {String} action - Action name
         * @param {String} type - Hook type (sync|async)
         * @param {String} description - Hook description
         * 
         * @returns {Object} Hook object
         */
        subscribe: {
            params: {
                hook: { type: "string" },
                service: { type: "string" },
                action: { type: "string" },
                type: { type: "string" },
                description: { type: "string" },
            },
            async handler(ctx) {
                // get params
                const { hook, service, action, type, description } = ctx.params;

                // check if hook exists
                const hookExists = await this.findEntity(null, {
                    query: {
                        hook: hook
                    }
                });

                // if hook exists, throw error
                if (hookExists) {
                    throw new MoleculerClientError("Hook already exists", 400, "HOOK_EXISTS", {
                        hook: hook
                    });
                }

                // create hook
                const hookObj = await this.createEntity(ctx, {
                    hook: hook,
                    service: service,
                    action: action,
                    type: type,
                    description: description
                });

                // return hook object
                return hookObj;
            }
        },

        /**
         * Unsubscribe from a hook
         * 
         * @actions
         * @param {String} hook - Hook name
         * 
         * @returns {Object} Hook object
         */
        unsubscribe: {
            params: {
                hook: { type: "string" }
            },
            async handler(ctx) {
                // get params
                const { hook } = ctx.params;

                // check if hook exists
                const hookExists = await this.findEntity(null, {
                    query: {
                        hook: hook
                    }
                });

                // if hook does not exist, throw error
                if (!hookExists) {
                    throw new MoleculerClientError("Hook does not exist", 400, "HOOK_NOT_EXISTS", {
                        hook: hook
                    });
                }

                // delete hook
                const hookObj = await this.adapter.removeEntity(ctx, {
                    id: hookExists.id
                });

                // return hook object
                return hookObj;
            }
        },

        /**
         * Trigger a hook
         * 
         * @actions
         * @param {String} hook - Hook name
         * @param {Object} data - Hook data
         * 
         * @returns {Object} Hook object
         */
        trigger: {
            params: {
                hook: { type: "string" },
                data: { type: "object", optional: true }
            },
            async handler(ctx) {
                // get params
                const { hook, data } = ctx.params;

                // check if hook exists
                const hookExists = await this.findEntity(null, {
                    query: {
                        hook: hook
                    }
                });

                // if hook does not exist, throw error
                if (!hookExists) {
                    throw new MoleculerClientError("Hook does not exist", 400, "HOOK_NOT_EXISTS", {
                        hook: hook
                    });
                }

                // get hook subscribers
                const subscribers = await this.findEntities(null, {
                    query: {
                        hook: hook
                    }
                });

                // loop through subscribers
                for (const subscriber of subscribers) {
                    // use ctx.call to call action
                    // if type is sync, use await
                    // if type is async, do not use await
                    if (subscriber.type === "sync") {
                        await ctx.call(subscriber.service + "." + subscriber.action, data);
                    } else {
                        ctx.call(subscriber.service + "." + subscriber.action, data);
                    }
                }

                // return hook object
                return hookExists;
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
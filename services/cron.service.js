const DbService = require("db-mixin");
const Membership = require("membership-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;
const Context = require('moleculer').Context;

const cron = require('cron-parser');


/**
 * cron service
 * 
 * @description
 * Cron service for scheduling tasks to run at specific times
 * other services can subscribe to cron events
 */



module.exports = {
    // name of service
    name: "utils.cron",
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
            'cron.**'
        ]),
        DbService({
            permissions: 'utils.cron'
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

            // cron name
            name: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
                trim: true,
                lowercase: true,
                description: "Cron name"
            },

            // cron type
            type: {
                type: "string",
                required: false,
                default: 'cron',
                enum: ['cron', 'interval'],
                description: "Cron type"
            },

            // cron schedule
            schedule: {
                type: "string",
                required: true,
                min: 3,
                max: 255,
                trim: true,
                description: "Cron schedule"
            },

            // cron status
            status: {
                type: "string",
                required: false,
                default: 'active',
                enum: ['active', 'inactive'],
                description: "Cron status"
            },

            // cron next run
            nextRun: {
                type: "number",
                required: false,
                default: Date.now(),
                description: "Cron next run"
            },

            // cron last run
            lastRun: {
                type: "number",
                required: false,
                default: Date.now(),
                description: "Cron last run"
            },

            // cron last error
            error: {
                type: "object",
                required: false,
                default: null,
                props: {
                    message: {
                        type: "string",
                        required: true,
                        description: "Error message"
                    },
                    time: {
                        type: "number",
                        required: true,
                        description: "Error time"
                    },
                },
                description: "Cron last error"
            },

            // run count
            runCount: {
                type: "number",
                required: false,
                default: 0,
                description: "Cron run count"
            },



            // cron action name
            action: {
                type: "string",
                required: true,
                trim: true,
                description: "Cron action name"
            },

            // cron action params
            params: {
                type: "object",
                required: false,
                default: {},
                description: "Cron action params"
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

        },

        // default cron config settings
        cron: [
            {
                name: 'test',
                schedule: '*/1 * * * *',
                action: 'v1.utils.cron.testAction',
                params: {}
            }
        ]
    },


    /**
     * service actions
     */
    actions: {

        /**
         * register cron job
         * 
         * @actions
         * @param {String} name - Cron name
         * @param {String} schedule - Cron schedule
         * @param {String} action - Cron action name
         * @param {Object} params - Cron action params
         * 
         * @returns {Object} Cron job object
         */
        register: {
            params: {
                name: {
                    type: "string",
                    optional: false,
                    description: "Cron name"
                },
                schedule: {
                    type: "string",
                    optional: false,
                    description: "Cron schedule"
                },
                action: {
                    type: "string",
                    optional: false,
                    description: "Cron action name"
                },
                params: {
                    type: "object",
                    optional: true,
                    default: {},
                    description: "Cron action params"
                },
            },
            async handler(ctx) {
                const params = Object.assign({}, ctx.params);

                // aquire lock
                await ctx.call('v1.utils.lock.acquire', {
                    key: `cron.${params.name}`
                });

                // check if cron job exists
                let cronJob = await this.findEntity(null, {
                    query: {
                        name: params.name
                    }
                });

                // if cron job does not exist, create it
                if (!cronJob) {
                    const nextRun = await this.parseCronSchedule(ctx, params.schedule);
                    cronJob = await this.createEntity(ctx, {
                        name: params.name,
                        schedule: params.schedule,
                        action: params.action,
                        params: params.params,
                        nextRun: nextRun,
                    });

                    this.logger.info(`Cron job created: ${params.name}`);
                }

                // release lock
                await ctx.call('v1.utils.lock.release', {
                    key: `cron.${params.name}`
                });

                // return cron job
                return cronJob;
            }
        },

        /**
         * test action
         */
        testAction: {
            async handler(ctx) {
                return 'test';
            }
        },

        test: {
            async handler(ctx) {
                return this.actions.register({
                    name: 'test',
                    schedule: '*/1 * * * *',
                    action: 'v1.utils.cron.testAction',
                    params: {}
                })
            }
        },



        /**
         * get cron job
         * 
         * @actions
         * @param {String} name - Cron name
         * 
         * @returns {Object} Cron job object
         */
        getByName: {
            rest: {
                method: "GET",
                path: "/:name"
            },
            params: {
                name: {
                    type: "string",
                    optional: false,
                    description: "Cron name"
                }
            },
            async handler(ctx) {
                // get params
                const { name } = ctx.params;

                // get cron job
                const cronJob = await this.findEntity(null, {
                    query: {
                        name: name
                    }
                });

                // if cron job does not exist, throw error
                if (!cronJob) {
                    throw new MoleculerClientError("Cron job not found", 400, "CRON_JOB_NOT_FOUND", {
                        name: name
                    });
                }

                // return cron job
                return cronJob;
            }
        },

        /**
         * process service cron configs
         * 
         * @actions
         * 
         * @returns {Object} Cron job object
         */
        processServiceCronConfigs: {
            async handler(ctx) {
                return this.processServiceCronConfigs(ctx);
            }
        },
    },

    /**
     * service events
     */
    events: {
        "$services.changed"() {
            if (!this.needsSetup) {
                this.logger.info('services changed')
            }
            this.needsSetup = true;
        }
    },

    /**
     * service methods
     */
    methods: {
        /**
         * interval timer for cron
         * 
         */
        async intervalTimer() {
            // create context
            const ctx = Context.create(this.broker);

            // get all cron jobs
            let cronJobs = await this.findEntities(null, {
                query: {
                    type: 'cron',
                    status: 'active',
                    nextRun: {
                        $lte: Date.now()
                    }
                }
            });

            const promises = [];

            // loop through cron jobs
            for (let cronJob of cronJobs) {
                // run cron job
                promises.push(this.runCronJob(ctx, cronJob));
            }

            // wait for all promises to resolve
            await Promise.allSettled(promises);

            if (cronJobs.length > 0) {
                this.logger.info(`Cron jobs run: ${cronJobs.length}`);
            }

            if (this.needsSetup) {
                await this.processServiceCronConfigs(ctx);
                this.needsSetup = false;
            }
        },

        /**
         * run cron job
         * 
         * @param {Object} ctx - Moleculer context
         * @param {Object} cronJob - Cron job object
         *
         * @returns {Object} Cron job object
         */
        async runCronJob(ctx, cronJob) {
            // call action

            await ctx.call(cronJob.action, cronJob.params)
                .then(async res => {
                    // update cron job
                    await this.scheduleNextRun(ctx, cronJob);
                })
                .catch(async err => {
                    // update cron job
                    await this.scheduleNextRun(ctx, cronJob, err);
                });

            // return cron job
            return cronJob;
        },

        /**
         * calulate next run for cron job
         * 
         * @param {Object} ctx - Moleculer context
         * @param {Object} cronJob - Cron job object
         * @param {Object} err - Error object
         * 
         * @returns {Object} Cron job object
         */
        async scheduleNextRun(ctx, cronJob, err) {
            const cronSchedule = cronJob.schedule;

            // calculate next run
            const nextRun = await this.parseCronSchedule(ctx, cronSchedule);

            const update = {
                id: cronJob.id,
                nextRun: nextRun,
                lastRun: Date.now(),
                runCount: cronJob.runCount + 1,
            }

            if (err) {
                update.error = {
                    message: err.message,
                    time: Date.now()
                };
            }

            // update cron job
            return this.updateEntity(ctx, update);
        },

        /**
         * parse cron schedule string and return date object for next run
         * 
         * 45 23 * * 6 => 45 minutes past 11pm on Saturday
         * 
         * @param {Object} ctx - Moleculer context
         * @param {String} cronJob - Cron job stinrg
         * 
         * @returns {Object} Date object
         */
        async parseCronSchedule(ctx, cronSchedule) {
            const options = {
                currentDate: new Date(), // Use the current date as a starting point
                //endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Calculate the next 24 hours
                tz: 'UTC', // Set the time zone
            };
            const interval = cron.parseExpression(cronSchedule, options);

            // Get the next occurrence
            const nextOccurrence = interval.next();

            // Format the date and time
            const formattedDate = nextOccurrence.toDate();

            // return date object
            return formattedDate.getTime();
        },
        /**
         * setup timers
         * 
         * @returns {Object} Cron job object
         */
        async setup() {
            this.interval = setInterval(async () => {
                await this.intervalTimer();
            }, 10000);

            await this.processServiceCronConfigs(this.broker)
        },

        /**
         * process service cron configs
         * 
         * @param {Object} ctx - Moleculer context
         * 
         * @returns {Object} Cron job object
         */
        async processServiceCronConfigs(ctx) {
            // get all services
            const services = this.broker.registry.getServiceList({ withActions: false, grouping: true });

            const filtered = services.filter(s => s.settings.cron);
            const jobs = [];
            // loop through services and register and cron jobs
            for (const service of filtered) {
                const cronJobs = service.settings.cron;

                // loop through cron jobs
                for (const cronJob of cronJobs) {
                    // register cron job
                    await this.actions.register({
                        name: `${service.name}.${cronJob.name}`,
                        schedule: cronJob.schedule,
                        action: cronJob.action,
                        params: cronJob.params
                    });
                    jobs.push(cronJob);
                    this.logger.info(`Cron job registered: ${service.name}.${cronJob.name}`);
                }
            }

            return jobs
        },
    },

    /**
     * service created lifecycle event handler
     */
    created() {
        this.interval = null;
        this.runningJobs = new Map();
        // register cron jobs
        this.needsSetup = true;
    },

    /**
     * service started lifecycle event handler
     */
    async started() {
        await this.setup();
    },

    /**
     * service stopped lifecycle event handler
     */
    async stopped() {
        clearInterval(this.interval);
    }

}
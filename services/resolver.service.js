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
 * list of dns service providers
 */
const providers = [
    { "name": "google", "ip": "8.8.8.8" },
    { "name": "cloudflare", "ip": "1.1.1.1" },
    { "name": "quad", "ip": "9.9.9.9" },
    { "name": "opendns", "ip": "208.67.222.220" },
    { "name": "verizon_fios_business", "ip": "98.113.146.9" },
];
/**
 * dns service for resoving domains and IP addresses
 */
module.exports = {
    // name of service
    name: "utils.dns",
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
            'dns.**'
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
            "dns.defaultProvider": "google",
            "dns.server": "1.1.1.1",
            "dns.timeout": 5000,
            "dns.retries": 3,
        }
    },

    /**
     * service actions
     */
    actions: {
        /**
         * Resolve hostname or IP address
         * 
         * @actions
         * @param {String} host - Hostname or IP address to resolve
         * @param {String} provider - DNS provider to use
         * 
         * @returns {Object} Resolved hostname or IP address
         */
        resolve: {
            rest: {
                method: "GET",
                path: "/resolve/:host"
            },
            params: {
                host: { type: "string" },
                provider: { type: "string", optional: true },
            },
            async handler(ctx) {
                // get host
                const host = ctx.params.host;
                // get provider
                const provider = ctx.params.provider || this.provider;
                // resolve hostname or IP address
                const result = await this.resolve(host, provider);
                // return result
                return result;
            }
        },

        /**
         * Reverse lookup IP address
         * 
         * @actions
         * @param {String} ip - IP address to reverse lookup
         * @param {String} provider - DNS provider to use
         * 
         * @returns {Object} Reverse lookup result
         */
        reverse: {
            rest: {
                method: "GET",
                path: "/reverse/:ip"
            },
            params: {
                ip: { type: "string" },
                provider: { type: "string", optional: true },
            },
            async handler(ctx) {
                // get ip
                const ip = ctx.params.ip;
                // get provider
                const provider = ctx.params.provider || this.provider;
                // reverse lookup IP address
                const result = await this.reverse(ip, provider);
                // return result
                return result;
            }
        },

        /**
         * Lookup DNS record
         * 
         * @actions
         * @param {String} host - Hostname or IP address to lookup
         * @param {String} type - DNS record type to lookup
         * @param {String} provider - DNS provider to use
         * 
         * @returns {Object} DNS record
         */
        lookup: {
            rest: {
                method: "GET",
                path: "/lookup/:host"
            },
            params: {
                host: { type: "string" },
                type: { type: "string", optional: true },
                provider: { type: "string", optional: true },
            },
            async handler(ctx) {
                // get host
                const host = ctx.params.host;
                // get type
                const type = ctx.params.type || "A";
                // get provider
                const provider = ctx.params.provider || this.provider
                // lookup DNS record
                const result = await this.lookup(host, type, provider);
                // return result
                return result;
            }
        },

        /**
         * propagate dns records from all providers
         * 
         * @actions
         * @param {String} host - Hostname or IP address to lookup
         * @param {String} type - DNS record type to lookup
         * 
         * @returns {Object} DNS record
         */
        propagate: {
            rest: {
                method: "GET",
                path: "/propagate/:host"
            },
            params: {
                host: { type: "string" },
                type: { type: "string", optional: true },
            },
            async handler(ctx) {
                // get host
                const host = ctx.params.host;
                // get type
                const type = ctx.params.type || "A";
                // propagate DNS record
                const result = await this.propagate(host, type)
                    .catch(err => {
                        console.log(err);
                        return err.message;
                    });
                // return result
                return result;
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
         * Initialize service
         */
        async init() {

            // set default provider
            this.provider = this.config['dns.defaultProvider'];
            // set default timeout
            this.timeout = this.config['dns.timeout'];
            // set default retries
            this.retries = this.config['dns.retries'];

            // create resolver
            this.resolver = new Resolver({
                timeout: this.timeout,
                tries: this.retries
            });
            // set resolver server
            this.resolver.setServers([this.config['dns.server']]);

            // create provider list of resolvers
            this.providers = new Map();
            // loop through providers
            for (let provider of providers) {
                const resolver = new Resolver({
                    timeout: this.timeout,
                    tries: this.retries
                });
                resolver.setServers([provider.ip]);
                // add provider to list
                this.providers.set(provider.name, resolver);
            }

        },

        /**
         * Resolve hostname or IP address
         * 
         * @param {String} host - Hostname or IP address to resolve
         * @param {String} provider - DNS provider to use
         * 
         * @returns {Object} Resolved hostname or IP address
         */
        async resolve(host, provider = this.provider) {
            // get provider
            const resolver = this.providers.get(provider);
            // resolve hostname or IP address
            const result = await resolver.resolve(host);
            // return result
            return result;
        },

        /**
         * Reverse lookup IP address
         * 
         * @param {String} ip - IP address to reverse lookup
         * @param {String} provider - DNS provider to use
         * 
         * @returns {Object} Reverse lookup result
         */
        async reverse(ip, provider = this.provider) {
            // get provider
            const resolver = this.providers.get(provider);
            // reverse lookup IP address
            const result = await resolver.reverse(ip);
            // return result
            return result;
        },

        /**
         * Lookup DNS record
         * 
         * @param {String} host - Hostname or IP address to lookup
         * @param {String} type - DNS record type to lookup
         * @param {String} provider - DNS provider to use
         * 
         * @returns {Object} DNS record
         */
        async lookup(host, type = "A", provider = this.provider) {
            // get provider
            const resolver = this.providers.get(provider);
            // lookup DNS record
            const result = await resolver.resolve(host, type);
            // return result
            return result;
        },

        /**
         * propagate dns records from all providers
         * 
         * @param {String} host - Hostname or IP address to lookup
         * @param {String} type - DNS record type to lookup
         * 
         * @returns {Object} DNS record
         */
        async propagate(host, type = "A") {
            // create dns records
            const records = [];
            // loop through providers
            for (let provider of providers) {
                // lookup dns record
                const result = await this.lookup(host, type, provider.name);
                // add dns record to list
                records.push({
                    provider: provider.name,
                    record: result
                });
            }
            // return dns records
            return records;
        }

    },

    /**
     * created lifecycle event handler
     */
    created() {

    },

    /**
     * started lifecycle event handler
     */
    async started() {
        // create provider list of resolvers
        return this.init();
    },

    /**
     * stopped lifecycle event handler
     */
    async stopped() { },

};
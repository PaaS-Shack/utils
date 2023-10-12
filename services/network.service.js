const DbService = require("db-mixin");
const Membership = require("membership-mixin");
const ConfigLoader = require("config-mixin");
const { MoleculerClientError } = require("moleculer").Errors;

const exec = require('child_process').exec;

const whoiser = require('whoiser');

/**
 * network related utilities service
 * Includes MTR scan and other network related utilities
 * 
 * Mtr is a network diagnostic tool that combines ping and traceroute into one program.
 * 
 */

module.exports = {
    // name of service
    name: "utils.network",
    // version of service
    version: 1,

    /**
     * Service Mixins
     * 
     * @type {Array}
     * @property {ConfigLoader} ConfigLoader - Config loader mixin
     */
    mixins: [
        ConfigLoader([
            'mtr.**'
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
         * MTR scan 
         * 
         * @actions
         * @param {String} host - Hostname or IP address to scan
         * @param {Number} count - Number of pings to send
         * 
         * @returns {Object} MTR scan results
         */
        mtr: {
            rest: {
                method: "GET",
                path: "/mtr/:host"
            },
            params: {
                host: { type: "string" },
                count: { type: "number", optional: true, default: 10 }
            },
            async handler(ctx) {
                const { host, count } = ctx.params;

                return new Promise((resolve, reject) => {
                    exec(`mtr -z -b -w -n -j -c ${count} ${host}`, (error, stdout, stderr) => {
                        if (error) {
                            reject(error);
                        }
                        if (stderr) {
                            reject(stderr);
                        }

                        let json = null;
                        try {
                            json = JSON.parse(stdout);
                        } catch (error) {
                            return reject(error);
                        }
                        resolve(json);
                    });
                });
            }
        },

        /**
         * Ping scan
         * 
         * @actions
         * @param {String} host - Hostname or IP address to scan
         * @param {Number} count - Number of pings to send
         * 
         * @returns {Object} Ping scan results
         */
        ping: {
            rest: {
                method: "GET",
                path: "/ping/:host"
            },
            params: {
                host: { type: "string" },
                count: { type: "number", optional: true, default: 10 }
            },
            async handler(ctx) {
                const { host, count } = ctx.params;

                return new Promise((resolve, reject) => {
                    exec(`ping -c ${count} ${host}`, (error, stdout, stderr) => {
                        if (error) {
                            reject(error);
                        }
                        if (stderr) {
                            reject(stderr);
                        }
                        // parse ping results
                        const results = stdout.split('\n');

                        // parse ping statistics with regex
                        //--- 1.1.1.1 ping statistics ---
                        //4 packets transmitted, 4 received, 0% packet loss, time 3004ms
                        //rtt min/avg/max/mdev = 19.158/124.330/300.607/114.630 ms
                        const pingStats = { avr: 0 };
                        const regex = /(\d+) packets transmitted, (\d+) received, (\d+)% packet loss, time (\d+)ms/;
                        const matches = stdout.match(regex);
                        if (matches) {
                            const [_, transmitted, received, loss, time] = matches;
                            pingStats.transmitted = Number(transmitted);
                            pingStats.received = Number(received);
                            pingStats.loss = Number(loss);
                            pingStats.time = Number(time);
                        }

                        // parse ping results
                        // regex `64 bytes from 1.1.1.1: icmp_seq=1 ttl=57 time=696 ms`

                        const pingResults = [];
                        results.forEach(result => {
                            const regex = /(\d+) bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=(\d+) time=(\d+\.\d+) ms/;
                            const matches = result.match(regex);
                            if (matches) {
                                const [_, bytes, ip, seq, ttl, time] = matches;
                                pingStats.avr += Number(time);
                                pingResults.push({
                                    bytes: Number(bytes),
                                    ip: ip,
                                    seq: Number(seq),
                                    ttl: Number(ttl),
                                    time: Number(time)
                                });
                            }
                        });

                        pingStats.avr = Number((pingStats.avr / pingResults.length).toFixed(3));

                        resolve({
                            statistics: pingStats,
                            results: pingResults
                        });
                    });
                });
            }
        },

        /**
         * Traceroute scan
         * 
         * @actions
         * @param {String} host - Hostname or IP address to scan
         * @param {Number} count - Number of pings to send
         * 
         * @returns {Object} Traceroute scan results
         */
        traceroute: {
            rest: {
                method: "GET",
                path: "/traceroute/:host"
            },
            params: {
                host: { type: "string" },
                count: { type: "number", optional: true, default: 10 }
            },
            async handler(ctx) {
                const { host, count } = ctx.params;

                return new Promise((resolve, reject) => {
                    exec(`traceroute -w ${count} ${host}`, (error, stdout, stderr) => {
                        if (error) {
                            reject(error);
                        }
                        if (stderr) {
                            reject(stderr);
                        }
                        // parse traceroute results
                        // 'traceroute to 1.1.1.1 (1.1.1.1), 64 hops max',
                        // '  1   192.168.99.1  144.451ms  2.317ms  3.030ms ',
                        // '  2   99.245.92.1  18.298ms  180.631ms  26.261ms ',
                        // '  3   24.156.158.177  178.880ms  21.655ms  23.202ms ',
                        // '  4   209.148.232.37  160.282ms  19.422ms  23.187ms ',
                        // '  5   209.148.235.214  368.918ms  18.760ms  18.168ms ',
                        // '  6   *  *  * ',
                        // '  7   108.162.239.4  25.045ms  21.827ms  18.604ms ',
                        // '  8   1.1.1.1  19.515ms  19.857ms  80.479ms ',
                        // ''
                        const results = stdout.split('\n');

                        // parse traceroute results
                        const tracerouteResults = [];
                        results.forEach(result => {
                            const regex = /(\d+)\s+([\d\.]+)\s+(\d+\.\d+)ms\s+(\d+\.\d+)ms\s+(\d+\.\d+)ms/;
                            const matches = result.match(regex);
                            if (matches) {
                                const [_, hop, ip, rtt1, rtt2, rtt3] = matches;
                                tracerouteResults.push({
                                    hop: hop,
                                    ip: ip,
                                    rtt1: rtt1,
                                    rtt2: rtt2,
                                    rtt3: rtt3
                                });
                            }
                        });

                        resolve({
                            results: tracerouteResults
                        });
                    });
                });
            }
        },

        /**
         * domain whois lookup
         * 
         * @param {String} domain - Domain name to lookup
         * 
         * @returns {Object} Whois lookup results
         */
        whois: {
            rest: {
                method: "GET",
                path: "/whois/:domain"
            },
            params: {
                domain: { type: "string" }
            },
            async handler(ctx) {
                const { domain } = ctx.params;

                const result = await whoiser(domain);

                const parsed = {};

                const providerKeys = Object.keys(result);
                const providerKey = providerKeys[0];

                const provider = result[providerKey];

                const keys = Object.keys(provider);
                keys.forEach(key => {
                    const providerValue = provider[key];

                    if (providerValue === null || providerValue === undefined || providerValue === '') {
                        return;
                    }
                    if (key[0] === '>' || key === 'raw' || key === 'text') {
                        return;
                    }

                    const normalizedKey = key.toLowerCase().split(' ').join('_');

                    if (normalizedKey == 'domain_status') {
                        parsed[normalizedKey] = providerValue.map(status => {
                            return status.split(' ').shift();
                        });
                    } else {
                        parsed[normalizedKey] = providerValue;
                    }
                });

                return parsed;
            }
        },

        /**
         * as whois lookup
         * 
         * @param {String} as - AS number to lookup
         * 
         * @returns {Object} Whois lookup results
         */
        as: {
            rest: {
                method: "GET",
                path: "/as/:as"
            },
            params: {
                as: { type: "string" }
            },
            async handler(ctx) {
                const { as } = ctx.params;

                const result = await whoiser.asn(as);
                return result;
            }
        },

        /**
         * ip whois lookup
         * 
         * @param {String} ip
         * 
         * @returns {Object} Whois lookup results
         */
        ip: {
            rest: {
                method: "GET",
                path: "/as/:as"
            },
            params: {
                ip: { type: "string" }
            },
            async handler(ctx) {
                const { ip } = ctx.params;

                const result = await whoiser.ip(ip);
                return result;
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

    created() { },

    async started() { },

    async stopped() { },
}
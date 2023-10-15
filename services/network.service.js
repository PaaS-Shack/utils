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
            'utils.network.**'
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
         * @param {String} ip - Hostname or IP address to scan
         * @param {Number} count - Number of pings to send
         * 
         * @returns {Object} MTR scan results
         */
        mtr: {
            rest: {
                method: "GET",
                path: "/mtr/:ip"
            },
            params: {
                ip: { type: "string" },
                count: { type: "number", optional: true, default: 10 }
            },
            async handler(ctx) {
                const { ip, count } = ctx.params;

                return new Promise((resolve, reject) => {
                    exec(`mtr -z -b -w -j -c ${count} ${ip}`, (error, stdout, stderr) => {
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
         * @param {String} ip - Hostname or IP address to scan
         * @param {Number} count - Number of pings to send
         * 
         * @returns {Object} Ping scan results
         */
        ping: {
            rest: {
                method: "GET",
                path: "/ping/:ip"
            },
            params: {
                ip: { type: "string" },
                count: { type: "number", optional: true, default: 10 }
            },
            async handler(ctx) {
                const { ip, count } = ctx.params;

                return new Promise((resolve, reject) => {
                    exec(`ping -c ${count} ${ip}`, (error, stdout, stderr) => {
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
                            const regex = /(\d+) bytes from (\d+\.\d+\.\d+\.\d+): icmp_seq=(\d+) ttl=(\d+) time=(\d+) ms/;
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
                ip: { type: "string" },
                count: { type: "number", optional: true, default: 10 }
            },
            async handler(ctx) {
                const { ip, count } = ctx.params;

                return new Promise((resolve, reject) => {
                    exec(`traceroute -w ${count} ${ip}`, (error, stdout, stderr) => {
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
         * @param {String} host - Whois server to use
         * @param {Number} timeout - Whois server timeout
         * 
         * @returns {Object} Whois lookup results
         */
        whois: {
            rest: {
                method: "GET",
                path: "/whois/:domain"
            },
            params: {
                domain: { type: "string" },
                host: {
                    type: "string",
                    optional: true,
                },
                timeout: {
                    type: "number",
                    optional: true,
                    default: 10000
                }
            },
            async handler(ctx) {
                const { domain, host, timeout } = ctx.params;

                return whoiser(domain, {
                    host, timeout
                });
            }
        },

        /**
         * as whois lookup
         * 
         * @param {String} as - AS number to lookup
         * @param {String} host - Whois server to use
         * @param {Number} timeout - Whois server timeout
         * 
         * 
         * @returns {Object} Whois lookup results
         */
        asn: {
            rest: {
                method: "GET",
                path: "/as/:as"
            },
            params: {
                asn: { type: "string" },
                host: {
                    type: "string",
                    optional: true
                },
                timeout: {
                    type: "number",
                    optional: true,
                    default: 10000
                }
            },
            async handler(ctx) {
                const { asn, host, timeout } = ctx.params;

                return whoiser.asn(asn, {
                    host, timeout
                });
            }
        },

        /**
         * ip whois lookup
         * 
         * @param {String} ip - IP address to lookup
         * @param {String} host - Whois server to use
         * @param {Number} timeout - Whois server timeout
         * @param {Boolean} raw - Return raw whois results
         * 
         * @returns {Object} Whois lookup results
         */
        ip: {
            rest: {
                method: "GET",
                path: "/as/:as"
            },
            params: {
                ip: { type: "string" },
                host: {
                    type: "string",
                    optional: true
                },
                timeout: {
                    type: "number",
                    optional: true,
                    default: 10000
                },
                raw: {
                    type: "boolean",
                    optional: true,
                    default: false
                }
            },
            async handler(ctx) {
                const { ip, host, timeout, raw } = ctx.params;

                return whoiser.ip(ip, {
                    host, timeout, raw
                });
            }
        },

        /**
         * convert route to range
         * 
         * @param {String} route - CIDR route
         * 
         * @returns {Object} Range
         */
        routeToRange: {
            rest: {
                method: "GET",
                path: "/routeToRange/:route"
            },
            params: {
                route: { type: "string" }
            },
            async handler(ctx) {
                const { route } = ctx.params;
                return this.ipRange(route);
            }
        },

        /**
         * allTlds
         * 
         * @returns {Object} list of all TLDs
         */
        allTlds: {
            rest: {
                method: "GET",
                path: "/allTlds"
            },
            async handler(ctx) {
                return whoiser.allTlds();
            }
        },

        /**
         * whois list
         * 
         * @returns {Array} Whois list
         */
        lists: {
            rest: {
                method: "GET",
                path: "/lists"
            },
            async handler(ctx) {
                return {
                    ip: {
                        arin: {
                            ipv4: 'whois.arin.net',
                            ipv6: 'whois.arin.net'
                        },
                        ripe: {
                            ipv4: 'whois.ripe.net',
                            ipv6: 'whois.ripe.net'
                        },
                        apnic: {
                            ipv4: 'whois.apnic.net',
                            ipv6: 'whois.apnic.net'
                        },
                        lacnic: {
                            ipv4: 'whois.lacnic.net',
                            ipv6: 'whois.lacnic.net'
                        },
                        afrinic: {
                            ipv4: 'whois.afrinic.net',
                            ipv6: 'whois.afrinic.net'
                        },
                    },
                }
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
        ipRange(CIDR) {

            //Beginning IP address
            var beg = CIDR.substr(CIDR, CIDR.indexOf('/'));
            var end = beg;
            var off = (1 << (32 - parseInt(CIDR.substr(CIDR.indexOf('/') + 1)))) - 1;
            var sub = beg.split('.').map(function (a) { return parseInt(a) });

            //An IPv4 address is just an UInt32...
            var buf = new ArrayBuffer(4); //4 octets 
            var i32 = new Uint32Array(buf);

            //Get the UInt32, and add the bit difference
            i32[0] = (sub[0] << 24) + (sub[1] << 16) + (sub[2] << 8) + (sub[3]) + off;

            //Recombine into an IPv4 string:
            var end = Array.apply([], new Uint8Array(buf)).reverse().join('.');

            return [beg, end];
        },
    },

    created() { },

    async started() { },

    async stopped() { },
}
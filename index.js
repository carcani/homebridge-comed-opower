const { execFile } = require('child_process');
const path = require('path');

module.exports = (api) => {
  api.registerAccessory('ComEd Energy', ComEdEnergy);
};

class ComEdEnergy {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;

    const { Service, Characteristic } = api.hap;

    this.Service = Service;
    this.Characteristic = Characteristic;

    /*
     * ---------------------------------------------------------
     * Current values
     * ---------------------------------------------------------
     */

    this.latestKwh = 0;
    this.latestKw = 0;
    this.todayKwh = 0;
    this.yesterdayKwh = 0;

    /*
     * ---------------------------------------------------------
     * Accessory Information
     * ---------------------------------------------------------
     */

    this.informationService =
      new Service.AccessoryInformation();

    this.informationService
      .setCharacteristic(
        Characteristic.Manufacturer,
        'ComEd'
      );

    this.informationService
      .setCharacteristic(
        Characteristic.Model,
        'Smart Meter'
      );

    this.informationService
      .setCharacteristic(
        Characteristic.SerialNumber,
        'ComEd-Energy'
      );

    this.informationService
      .setCharacteristic(
        Characteristic.FirmwareRevision,
        '1.0'
      );

    /*
     * ---------------------------------------------------------
     * Power Management Service
     * ---------------------------------------------------------
     *
     * We use the standard HomeKit Power Management service
     * as the container for the ComEd energy information.
     *
     * The individual energy values are custom characteristics.
     */

    this.energyService =
      new Service.PowerManagement(
        config.name || 'ComEd Energy'
      );

    /*
     * ---------------------------------------------------------
     * Custom numeric characteristic
     * ---------------------------------------------------------
     *
     * Do not use Characteristic.Formats or Characteristic.Perms.
     *
     * Homebridge 2.x expects the characteristic properties
     * to be represented using the string values.
     */

    class NumericCharacteristic extends Characteristic {
      constructor(name, uuid, unit) {
        super(name, uuid);

        this.setProps({
          format: 'float',
          unit,
          minValue: 0,
          maxValue: 1000000,
          minStep: 0.001,
          perms: [
            'pr',
            'ev'
          ]
        });

        this.value =
          this.getDefaultValue();
      }
    }

    /*
     * ---------------------------------------------------------
     * Latest Consumption
     * ---------------------------------------------------------
     */

    class LatestKwhCharacteristic
      extends NumericCharacteristic {

      constructor() {
        super(
          'Latest Consumption',
          '7B7F0002-6E5A-4C4A-9F31-7B8A1C000002',
          'kWh'
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * Average Power
     * ---------------------------------------------------------
     */

    class AverageKwCharacteristic
      extends NumericCharacteristic {

      constructor() {
        super(
          'Average Power',
          '7B7F0003-6E5A-4C4A-9F31-7B8A1C000003',
          'kW'
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * Today's Consumption
     * ---------------------------------------------------------
     */

    class TodayKwhCharacteristic
      extends NumericCharacteristic {

      constructor() {
        super(
          'Today',
          '7B7F0004-6E5A-4C4A-9F31-7B8A1C000004',
          'kWh'
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * Yesterday's Consumption
     * ---------------------------------------------------------
     */

    class YesterdayKwhCharacteristic
      extends NumericCharacteristic {

      constructor() {
        super(
          'Yesterday',
          '7B7F0005-6E5A-4C4A-9F31-7B8A1C000005',
          'kWh'
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * Add characteristics to Power Management service
     * ---------------------------------------------------------
     */

    this.latestKwhChar =
      this.energyService.addCharacteristic(
        LatestKwhCharacteristic
      );

    this.averageKwChar =
      this.energyService.addCharacteristic(
        AverageKwCharacteristic
      );

    this.todayKwhChar =
      this.energyService.addCharacteristic(
        TodayKwhCharacteristic
      );

    this.yesterdayKwhChar =
      this.energyService.addCharacteristic(
        YesterdayKwhCharacteristic
      );

    /*
     * ---------------------------------------------------------
     * GET handlers
     * ---------------------------------------------------------
     */

    this.latestKwhChar.onGet(
      async () => this.latestKwh
    );

    this.averageKwChar.onGet(
      async () => this.latestKw
    );

    this.todayKwhChar.onGet(
      async () => this.todayKwh
    );

    this.yesterdayKwhChar.onGet(
      async () => this.yesterdayKwh
    );

    /*
     * ---------------------------------------------------------
     * Initial update
     * ---------------------------------------------------------
     */

    this.update();

    /*
     * ---------------------------------------------------------
     * Polling
     * ---------------------------------------------------------
     *
     * pollInterval is in minutes.
     */

    const interval =
      (Number(config.pollInterval) || 30) *
      60 *
      1000;

    this.timer = setInterval(
      () => this.update(),
      interval
    );
  }

  /*
   * -----------------------------------------------------------
   * Retrieve ComEd data
   * -----------------------------------------------------------
   */

  update() {
    const helper = path.join(
      __dirname,
      'opower_helper.py'
    );

    const python =
      this.config.python ||
      '/opt/homebridge-comed-opower-venv/bin/python';

    const loginFile =
      this.config.loginFile ||
      '/var/lib/homebridge/comed-login.json';

    const days =
      Number(this.config.days) || 2;

    const args = [
      helper,
      '--login-file',
      loginFile,
      '--days',
      String(days)
    ];

    const env = {
      ...process.env,
      OPOWER_USERNAME:
        this.config.username,
      OPOWER_PASSWORD:
        this.config.password
    };

    this.log(
      'Retrieving ComEd usage data...'
    );

    execFile(
      python,
      args,
      {
        env,
        timeout: 120000
      },
      (error, stdout, stderr) => {

        /*
         * -----------------------------------------------------
         * Python execution error
         * -----------------------------------------------------
         */

        if (error) {
          this.log.error(
            'ComEd helper error:',
            error.message
          );

          if (stderr) {
            this.log.error(
              stderr.trim()
            );
          }

          return;
        }

        /*
         * -----------------------------------------------------
         * Parse JSON
         * -----------------------------------------------------
         */

        let data;

        try {
          data = JSON.parse(stdout);
        } catch (err) {
          this.log.error(
            'Invalid ComEd JSON:',
            err.message
          );

          return;
        }

        /*
         * -----------------------------------------------------
         * Helper reported error
         * -----------------------------------------------------
         */

        if (!data.ok) {
          this.log.error(
            'ComEd:',
            data.error ||
            'Unknown error'
          );

          return;
        }

        /*
         * -----------------------------------------------------
         * Validate readings
         * -----------------------------------------------------
         */

        const readings =
          Array.isArray(data.readings)
            ? data.readings
            : [];

        if (!readings.length) {
          this.log.warn(
            'No ComEd readings returned'
          );

          return;
        }

        const validReadings =
          readings.filter(
            reading =>
              reading &&
              Number.isFinite(
                Number(reading.kwh)
              ) &&
              reading.start
          );

        if (!validReadings.length) {
          this.log.warn(
            'No valid ComEd readings returned'
          );

          return;
        }

        /*
         * -----------------------------------------------------
         * Latest interval
         * -----------------------------------------------------
         */

        const latest =
          validReadings[
            validReadings.length - 1
          ];

        this.latestKwh =
          Number(latest.kwh) || 0;

        /*
         * -----------------------------------------------------
         * Determine interval duration
         * -----------------------------------------------------
         *
         * ComEd normally reports 30-minute intervals.
         */

        let intervalHours = 0.5;

        if (
          latest.start &&
          latest.end
        ) {
          const start =
            new Date(
              latest.start
            );

          const end =
            new Date(
              latest.end
            );

          const hours =
            (end - start) /
            (1000 * 60 * 60);

          if (
            Number.isFinite(hours) &&
            hours > 0
          ) {
            intervalHours = hours;
          }
        }

        /*
         * -----------------------------------------------------
         * Average power
         * -----------------------------------------------------
         *
         * kW = kWh / hours
         * -----------------------------------------------------
         */

        this.latestKw =
          this.latestKwh /
          intervalHours;

        /*
         * -----------------------------------------------------
         * Daily totals
         * -----------------------------------------------------
         */

        const totals = {};

        for (
          const reading
          of validReadings
        ) {

          const date =
            this.getDateKey(
              reading.start
            );

          if (!date) {
            continue;
          }

          const kwh =
            Number(reading.kwh) || 0;

          totals[date] =
            (totals[date] || 0) +
            kwh;
        }

        /*
         * -----------------------------------------------------
         * Current ComEd date
         * -----------------------------------------------------
         */

        const today =
          this.getDateKey(
            latest.start
          );

        if (!today) {
          this.log.warn(
            'Could not determine ComEd date'
          );

          return;
        }

        /*
         * -----------------------------------------------------
         * Previous date
         * -----------------------------------------------------
         */

        const yesterday =
          this.getPreviousDateKey(
            today
          );

        /*
         * -----------------------------------------------------
         * Assign totals
         * -----------------------------------------------------
         */

        this.todayKwh =
          totals[today] || 0;

        this.yesterdayKwh =
          totals[yesterday] || 0;

        /*
         * -----------------------------------------------------
         * Update HomeKit
         * -----------------------------------------------------
         */

        this.latestKwhChar.updateValue(
          this.latestKwh
        );

        this.averageKwChar.updateValue(
          this.latestKw
        );

        this.todayKwhChar.updateValue(
          this.todayKwh
        );

        this.yesterdayKwhChar.updateValue(
          this.yesterdayKwh
        );

        /*
         * -----------------------------------------------------
         * Logging
         * -----------------------------------------------------
         */

        this.log(
          `ComEd latest usage: ` +
          `${this.latestKwh.toFixed(4)} kWh`
        );

        this.log(
          `ComEd average power: ` +
          `${this.latestKw.toFixed(3)} kW`
        );

        this.log(
          `ComEd today: ` +
          `${this.todayKwh.toFixed(3)} kWh`
        );

        this.log(
          `ComEd yesterday: ` +
          `${this.yesterdayKwh.toFixed(3)} kWh`
        );
      }
    );
  }

  /*
   * -----------------------------------------------------------
   * Convert timestamp to local date
   * -----------------------------------------------------------
   */

  getDateKey(value) {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, '0');

    const day =
      String(
        date.getDate()
      ).padStart(2, '0');

    return (
      `${year}-${month}-${day}`
    );
  }

  /*
   * -----------------------------------------------------------
   * Previous date
   * -----------------------------------------------------------
   */

  getPreviousDateKey(dateKey) {
    const date =
      new Date(
        `${dateKey}T12:00:00`
      );

    date.setDate(
      date.getDate() - 1
    );

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, '0');

    const day =
      String(
        date.getDate()
      ).padStart(2, '0');

    return (
      `${year}-${month}-${day}`
    );
  }

  /*
   * -----------------------------------------------------------
   * Homebridge services
   * -----------------------------------------------------------
   */

  getServices() {
    return [
      this.informationService,
      this.energyService
    ];
  }
}

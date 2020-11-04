/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { Adapter, Device, Property } from 'gateway-addon';

import { connect, MqttClient } from 'mqtt'

class HomieDevice extends Device {
  constructor(private adapter: any, private id: string, private mqtt: MqttClient) {
    super(adapter, id);
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this['@type'] = [];
    this.name = id;
  }

  public update(topic: string, payload: string) {
    const [
      base,
      devicePart,
      nodePart,
      propertyPart,
      keyPart
    ] = topic.split('/');

    if (!nodePart) {
      console.warn(`No node part in ${topic} found`);
      return;
    }

    // TODO: meta tags at property level are not verified right now and we can safely ignore this for now.
    // Also ignoring meta tags here makes sure they are not added as ThingProperty either.
    if (!propertyPart || propertyPart.startsWith('$')) {
      return;
    }

    const name = `${nodePart}-${propertyPart}`;

    let property: HomieProperty | undefined = <HomieProperty>this.properties.get(name);

    if (!property) {
      console.log(`Adding property ${name} to device ${this.id}`)
      property = new HomieProperty(this, name, {}, val => new Promise((resolve, reject) => {
        this.mqtt.publish(`${base}/${devicePart}/${nodePart}/${propertyPart}/set`, `${val}`, {}, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }));
      this.properties.set(name, property);
    }

    if (keyPart) {
      property.update(keyPart, payload);
      this.adapter.handleDeviceAdded(this);
    } else {
      property.castPayloadAndNotify(payload);
    }
  }
}

class HomieProperty extends Property {
  constructor(device: Device, name: string, propertyDescr: {}, private setter: (value: any) => Promise<void>) {
    super(device, name, propertyDescr);
    this.type = 'string';
  }

  public update(key: string, value: string) {
    console.log(`Updating key ${key} in property ${this.name}`);

    switch (key) {
      case '$name':
        this.title = value;
        break;
      case '$datatype':
        switch (value) {
          case 'integer':
            this.type = 'integer';
            break;
          case 'float':
            this.type = 'number';
            break;
          case 'boolean':
            this.type = 'boolean';
            break;
          case 'string':
          case 'enum':
          case 'color':
            this.type = 'string';
            break;
          default:
            console.warn(`Invalid type ${value}, falling back to string`);
            this.type = 'string';
            break;
        }
        break;
      case '$format':
        try {
          const match = /(\d+):(\d+)/g.exec(value);
          if (match && match.length > 2) {
            this.minimum = parseInt(match[1]);
            this.maximum = parseInt(match[2]);
            this["@type"] = 'LevelProperty';
          }
        } catch (e) {
          console.warn(`Could not parse $format: ${e}`);
        }
        break;
      case '$settable':
        this.readOnly = value != 'true';
        break;
      case '$unit':
        this.unit = value;
        switch (value) {
          case '°C':
            this['@type'] = 'TemperatureProperty'
            break;
          case 'V':
            this['@type'] = 'VoltageProperty'
            break;
          case 'W':
            this['@type'] = 'InstantaneousPowerProperty'
            break;
          case 'A':
            this['@type'] = 'CurrentProperty'
            break;
          case '%':
            this['@type'] = 'LevelProperty'
            break;
        }
        break;
    }
  }

  public castPayloadAndNotify(payload: string) {
    let castedPayload: any;
    switch (this.type) {
      case 'integer':
      case 'number':
        castedPayload = Number(payload);
        break;
      case 'boolean':
        castedPayload = Boolean(payload);
        break;
      case 'string':
      case 'enum':
      case 'color':
        castedPayload = payload;
        break;
      default:
        console.warn(`Invalid type ${this.type}, falling back to string. Value arrived before type message.`);
        castedPayload = payload;
        break;
    }

    this.setCachedValueAndNotify(castedPayload);
  }

  async setValue(value: any): Promise<void> {
    await this.setter(value);
    super.setValue(value);
  }
}

export class MqttAdapter extends Adapter {
  private devicesById: { [id: string]: HomieDevice } = {};

  constructor(addonManager: any, private manifest: any) {
    super(addonManager, MqttAdapter.name, manifest.name);
    addonManager.addAdapter(this);

    const {
      host,
      port
    } = this.manifest.moziot.config;

    this.connect(host || 'localhost', port || 1883);
  }

  private async connect(host: string, port: number) {
    console.log(`Connecting to ${host}`);

    const mqtt = connect({
      host,
      port
    });

    mqtt.on("error", (error) => console.error("Could not connect to the mqtt broker", error));
    mqtt.on("connect", () => console.log("Successfully connected to the mqtt broker"));
    mqtt.on("message", (topic: string, message: Buffer) => this.onMessage(topic, message, mqtt));

    mqtt.subscribe('+/+/#');
  }

  private onMessage(topic: string, payload: Buffer, mqtt: MqttClient) {
    const [
      ,
      devicePart
    ] = topic.split('/');

    if (devicePart) {
      const id = devicePart;
      let device = this.devicesById[id];

      if (!device) {
        console.log(`Creating new device for ${id}`);
        device = new HomieDevice(this, id, mqtt);
        this.devicesById[id] = device;
        this.handleDeviceAdded(device);
      }

      device.update(topic, payload.toString());
    } else {
      console.warn(`No device part found in ${topic}`);
    }
  }
}

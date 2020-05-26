/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.*
 */

import { Adapter, Device, Property } from 'gateway-addon';

import { connect } from 'mqtt'

class HomieDevice extends Device {
  constructor(private adapter: any, private id: string) {
    super(adapter, id);
    this['@context'] = 'https://iot.mozilla.org/schemas/';
    this['@type'] = [];
    this.name = id;
  }

  public update(topic: string, payload: string) {
    const [
      ,
      ,
      nodePart,
      propertyPart,
      keyPart
    ] = topic.split('/');

    if (!nodePart) {
      console.warn(`No node part in ${topic} found`);
      return;
    }

    if (!propertyPart) {
      return;
    }

    const name = `${nodePart}-${propertyPart}`;

    let property: HomieProperty | undefined = <HomieProperty>this.properties.get(name);

    if (!property) {
      console.log(`Adding property ${name} to device ${this.id}`)
      property = new HomieProperty(this, name, {});
      this.properties.set(name, property);
    }

    if (keyPart) {
      property.update(keyPart, payload);
      this.adapter.handleDeviceAdded(this);
    } else {
      property.setCachedValueAndNotify(payload);
    }
  }
}

class HomieProperty extends Property {
  public update(key: string, value: string) {
    console.log(`Updating key ${key} in property ${this.name}`);

    switch (key) {
      case '$name':
        this.title = value;
        break;
      case '$datatype':
        this.type = value;
        break;
      case '$settable':
        this.readOnly = !!value;
        break;
      case '$unit':
        this.unit = value;
        break;
    }
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
    mqtt.on("message", (topic: string, message: Buffer) => this.onMessage(topic, message));

    mqtt.subscribe('+/+/#');
  }

  private onMessage(topic: string, payload: Buffer) {
    const [
      ,
      devicePart
    ] = topic.split('/');

    if (devicePart) {
      const id = devicePart;
      let device = this.devicesById[id];

      if (!device) {
        console.log(`Creating new device for ${id}`);
        device = new HomieDevice(this, id);
        this.devicesById[id] = device;
        this.handleDeviceAdded(device);
      }

      device.update(topic, payload.toString());
    } else {
      console.warn(`No device part found in ${topic}`);
    }
  }
}

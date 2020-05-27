/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare module 'gateway-addon' {
    class Property {
        protected '@type': string[];
        protected name: string;
        protected title: string;
        protected type: string;
        protected readOnly: boolean;
        protected unit: string;
        protected device: Device;
        constructor(device: Device, name: string, propertyDescr: {});
        public setCachedValueAndNotify(value: any): void;
        public setValue(value: any): Promise<void>
    }

    class Device {
        protected '@context': string;
        protected '@type': string[];
        protected name: string;
        protected description: string;

        constructor(adapter: Adapter, id: string);

        protected properties: Map<String, Property>;
    }

    class Adapter {
        constructor(addonManager: any, id: string, packageName: string);

        public handleDeviceAdded(device: Device): void;
    }
}

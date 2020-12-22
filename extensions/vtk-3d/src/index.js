import React from 'react';
import commandsModule from './commandsModule.js';
import toolbarModule from './toolbarModule.js';
import { version } from '../package.json';

const Component = React.lazy(() => {
  return import('./OHIFVTK3DViewport.js');
});

const OHIFVTK3DViewport = props => {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <Component {...props} />
    </React.Suspense>
  );
};

const vtk3dExtension = {
  /**
   * Only required property. Should be a unique value across all extensions.
   */
  id: 'vtk-3d',
  version,

  getViewportModule({ servicesManager }) {
    const ExtendedVTK3DViewport = props => (
      <OHIFVTK3DViewport {...props} servicesManager={servicesManager} />
    );
    return ExtendedVTK3DViewport;
  },
  getToolbarModule() {
    return toolbarModule;
  },
  getCommandsModule({ commandsManager, servicesManager }) {
    const { UINotificationService } = servicesManager.services;
    return commandsModule({ commandsManager, UINotificationService });
  },
};

export default vtk3dExtension;

export { vtk3dExtension };

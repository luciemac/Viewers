import setVTK3DLayout from './utils/setVTK3DLayout.js';
import cornerstone from 'cornerstone-core';

const commandsModule = ({ commandsManager }) => {
  let api = null;

  function getVOIFromCornerstoneViewport() {
    const dom = commandsManager.runCommand('getActiveViewportEnabledElement');
    const cornerstoneElement = cornerstone.getEnabledElement(dom);

    if (cornerstoneElement) {
      const imageId = cornerstoneElement.image.imageId;

      const Modality = cornerstone.metaData.get('Modality', imageId);

      if (Modality !== 'PT') {
        const { windowWidth, windowCenter } = cornerstoneElement.viewport.voi;

        return {
          windowWidth,
          windowCenter,
        };
      }
    }
  }

  function setVOI(voi) {
    const { windowWidth, windowCenter } = voi;
    api.updateVOI(windowWidth, windowCenter);
  }


  const actions = {
    view3d: async ({ viewports }) => {
      const cornerstoneVOI = getVOIFromCornerstoneViewport();
      try {
        api = await setVTK3DLayout();
      } catch (error) {
        throw new Error(error);
      }

      if (cornerstoneVOI) {
        setVOI(cornerstoneVOI);
      }

    },
  };

  window.vtkActions = actions;

  const definitions = {
    view3d: {
      commandFn: actions.view3d,
      storeContexts: ['viewports'],
      options: {},
      context: 'VIEWER',
    },
  };

  return {
    definitions,
    defaultContext: 'ACTIVE_VIEWPORT::VTK-3D',
  };
};

export default commandsModule;

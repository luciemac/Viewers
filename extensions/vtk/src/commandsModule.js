import throttle from 'lodash.throttle';
import {
  vtkInteractorStyleMPRWindowLevel,
  vtkInteractorStyleRotatableMPRCrosshairs,
  vtkSVGRotatableCrosshairsWidget,
  vtkInteractorStyleMPRRotate,
} from 'react-vtkjs-viewport';
import { getImageData } from 'react-vtkjs-viewport';
import { vec3 } from 'gl-matrix';
import setMPRLayout from './utils/setMPRLayout.js';
import setMPRAnd3DLayout from './utils/setMPRAnd3DLayout.js';
import setViewportToVTK from './utils/setViewportToVTK.js';
import Constants from 'vtk.js/Sources/Rendering/Core/VolumeMapper/Constants.js';
import OHIFVTKViewport from './OHIFVTKViewport';

const { BlendMode } = Constants;

const commandsModule = ({ commandsManager, servicesManager }) => {
  const { UINotificationService, LoggerService } = servicesManager.services;

  // TODO: Put this somewhere else
  let apis = {};
  let defaultVOI;
  let isLevelToolEnabled = false;

  async function _getActiveViewportVTKApi(viewports) {
    const {
      numRows,
      numColumns,
      layout,
      viewportSpecificData,
      activeViewportIndex,
    } = viewports;

    const currentData = layout.viewports[activeViewportIndex];
    if (currentData && currentData.plugin === 'vtk') {
      // TODO: I was storing/pulling this from Redux but ran into weird issues
      if (apis[activeViewportIndex]) {
        return apis[activeViewportIndex];
      }
    }

    const displaySet = viewportSpecificData[activeViewportIndex];
    let api;
    if (!api) {
      try {
        api = await setViewportToVTK(
          displaySet,
          activeViewportIndex,
          numRows,
          numColumns,
          layout,
          viewportSpecificData
        );
      } catch (error) {
        throw new Error(error);
      }
    }

    return api;
  }

  function _setView(api, sliceNormal, viewUp) {
    const renderWindow = api.genericRenderWindow.getRenderWindow();
    const istyle = renderWindow.getInteractor().getInteractorStyle();
    istyle.setSliceNormal(...sliceNormal);
    istyle.setViewUp(...viewUp);

    renderWindow.render();
  }

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
    const lower = windowCenter - windowWidth / 2.0;
    const upper = windowCenter + windowWidth / 2.0;

    const rgbTransferFunction = apis[0].volumes[0]
      .getProperty()
      .getRGBTransferFunction(0);

    rgbTransferFunction.setRange(lower, upper);

    apis.forEach(api => {
      api.updateVOI(windowWidth, windowCenter);
      // initialize initial VOI
      api.setInitialVOI(windowWidth, windowCenter);
    });
  }

  async function set2DOrientation(viewports, sliceNormal, viewUp) {
    const api = await _getActiveViewportVTKApi(viewports);

      if (isA2DAPI(apis[viewports.activeViewportIndex])) {
        apis[viewports.activeViewportIndex] = api;
        _setView(api, sliceNormal, viewUp);
      }
  }

  function isA2DAPI(api) {
    return api.type === "VIEW2D";
  }

  function isA3DAPI(api) {
    return api.type === "VIEW3D";
  }

  function get2DViewsAPIs() {
    return apis.filter((api) => isA2DAPI(api));
  }

  function get3DViewsAPIs() {
    return apis.filter((api) => isA3DAPI(api));
  }

  function updateVOI(apis, windowWidth, windowCenter) {
    apis.forEach(api => {
      api.updateVOI(windowWidth, windowCenter);
    });
  }

  const throttledUpdateVOIs = throttle(updateVOI, 16, { trailing: true }); // ~ 60 fps

  const callbacks = {
    setOnLevelsChanged: ({ windowCenter, windowWidth }) => {
      apis.forEach(api => {
        const renderWindow = api.genericRenderWindow.getRenderWindow();
        renderWindow.render();
      });

      throttledUpdateVOIs(apis, windowWidth, windowCenter);
    },
  };

  const _convertModelToWorldSpace = (position, vtkImageData) => {
    const indexToWorld = vtkImageData.getIndexToWorld();
    const pos = vec3.create();

    position[0] += 0.5; /* Move to the centre of the voxel. */
    position[1] += 0.5; /* Move to the centre of the voxel. */
    position[2] += 0.5; /* Move to the centre of the voxel. */

    vec3.set(pos, position[0], position[1], position[2]);
    vec3.transformMat4(pos, pos, indexToWorld);

    return pos;
  };

  const actions = {
    getVtkApis: ({ index }) => {
      return apis[index];
    },
    resetMPRView() {
      const APIs2D = get2DViewsAPIs();
      const APIs3D = get3DViewsAPIs();

      // Reset APIs window/level
      apis.forEach((api) => {
        api.resetWindowLevel();
      });

      // Reset VOI
      if (defaultVOI) setVOI(defaultVOI);

      // Reset 2D APIs orientation and crosshairs
      APIs2D.forEach(api => {
        api.resetOrientation();
      });
      // Do not need to be called on each 2D API as long resetCrosshairs already do
      APIs2D[0].svgWidgets.rotatableCrosshairsWidget.resetCrosshairs(APIs2D, 0);

      // Reset 3D cameras
      APIs3D.forEach((api) => {
        api.resetCamera();
      });
    },
    axial: async ({ viewports }) => {
      await set2DOrientation(viewports, [0, 0, 1], [0, -1, 0]);
    },
    sagittal: async ({ viewports }) => {
      await set2DOrientation(viewports, [1, 0, 0], [0, 0, 1]);
    },
    coronal: async ({ viewports }) => {
      await set2DOrientation(viewports, [0, 1, 0], [0, 0, 1]);
    },
    requestNewSegmentation: async ({ viewports }) => {
      const allViewports = Object.values(viewports.viewportSpecificData);
      const promises = allViewports.map(async (viewport, viewportIndex) => {
        let api = apis[viewportIndex];

        if (!api) {
          api = await _getActiveViewportVTKApi(viewports);
          if (isA2DAPI(api)) {
            apis[viewportIndex] = api;
          }
        }

        if (isA2DAPI(api)) {
          api.requestNewSegmentation();
          api.updateImage();
        }
      });
      await Promise.all(promises);
    },
    jumpToSlice: async ({
      viewports,
      studies,
      StudyInstanceUID,
      displaySetInstanceUID,
      SOPClassUID,
      SOPInstanceUID,
      segmentNumber,
      frameIndex,
      frame,
      done = () => {},
    }) => {
      let api = apis[viewports.activeViewportIndex];

      if (!api) {
        api = await _getActiveViewportVTKApi(viewports);

        if (isA2DAPI(api)) {
          apis[viewports.activeViewportIndex] = api;
        }
      }

      if (!isA2DAPI(api)) {
        return null;
      }

      const stack = OHIFVTKViewport.getCornerstoneStack(
        studies,
        StudyInstanceUID,
        displaySetInstanceUID,
        SOPClassUID,
        SOPInstanceUID,
        frameIndex
      );

      const imageDataObject = getImageData(
        stack.imageIds,
        displaySetInstanceUID
      );

      let pixelIndex = 0;
      let x = 0;
      let y = 0;
      let count = 0;

      const rows = imageDataObject.dimensions[1];
      const cols = imageDataObject.dimensions[0];

      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          // [i, j] =
          const pixel = frame.pixelData[pixelIndex];
          if (pixel === segmentNumber) {
            x += i;
            y += j;
            count++;
          }
          pixelIndex++;
        }
      }
      x /= count;
      y /= count;

      const position = [x, y, frameIndex];
      const worldPos = _convertModelToWorldSpace(
        position,
        imageDataObject.vtkImageData
      );

      api.svgWidgets.rotatableCrosshairsWidget.moveCrosshairs(worldPos, apis);
      done();
    },
    setSegmentationConfiguration: async ({
      viewports,
      globalOpacity,
      visible,
      renderOutline,
      outlineThickness,
    }) => {
      const allViewports = Object.values(viewports.viewportSpecificData);
      const promises = allViewports.map(async (viewport, viewportIndex) => {
        let api = apis[viewportIndex];

        if (!api) {
          api = await _getActiveViewportVTKApi(viewports);
          if (isA2DAPI(api)) {
            apis[viewportIndex] = api;
          }
        }
        if (!isA2DAPI(api)) {
          return null;
        }

        api.setGlobalOpacity(globalOpacity);
        api.setVisibility(visible);
        api.setOutlineThickness(outlineThickness);
        api.setOutlineRendering(renderOutline);
        api.updateImage();
      });
      await Promise.all(promises);
    },
    setSegmentConfiguration: async ({ viewports, visible, segmentNumber }) => {
      const allViewports = Object.values(viewports.viewportSpecificData);
      const promises = allViewports.map(async (viewport, viewportIndex) => {
        let api = apis[viewportIndex];

        if (!api) {
          api = await _getActiveViewportVTKApi(viewports);
          if (isA2DAPI(api)) {
            apis[viewportIndex] = api;
          }
        }

        if (!isA2DAPI(api)) {
          return null;
        }

        api.setSegmentVisibility(segmentNumber, visible);
        api.updateImage();
      });
      await Promise.all(promises);
    },
    enableRotateTool: () => {
      const apis2D = get2DViewsAPIs();
      apis2D.forEach((api, apiIndex) => {
        const istyle = vtkInteractorStyleMPRRotate.newInstance();

        api.setInteractorStyle({
          istyle,
          configuration: { apis: apis2D, apiIndex, uid: api.uid },
        });
      });
    },
    enableCrosshairsTool: () => {
      isLevelToolEnabled = false;
      const apis2D = get2DViewsAPIs();
      apis2D.forEach((api, apiIndex) => {
        const istyle = vtkInteractorStyleRotatableMPRCrosshairs.newInstance();

        api.setInteractorStyle({
          istyle,
          configuration: {
            apis: apis2D,
            apiIndex,
            uid: api.uid,
          },
        });
      });

      const rotatableCrosshairsWidget =
      apis2D[0].svgWidgets.rotatableCrosshairsWidget;

      const referenceLines = rotatableCrosshairsWidget.getReferenceLines();

      // Initilise crosshairs if not initialised.
      if (!referenceLines) {
        rotatableCrosshairsWidget.resetCrosshairs(apis2D, 0);
      }

      const apis3D = get3DViewsAPIs();
      apis3D.forEach((api) => {
        api.enableWindowLevel({enableWindowLevel: false});
      });
    },
    enableLevelTool: () => {
      isLevelToolEnabled = true;
      const apis2D = get2DViewsAPIs();
      apis2D.forEach((api, apiIndex) => {
        const istyle = vtkInteractorStyleMPRWindowLevel.newInstance();

        api.setInteractorStyle({
          istyle,
          callbacks,
          configuration: {  apis: apis2D, apiIndex, uid: api.uid },
        });
      });

      const apis3D = get3DViewsAPIs();
      apis3D.forEach((api) => {
        api.enableWindowLevel({enableWindowLevel: true, onLevelsChangedCallback: callbacks.setOnLevelsChanged});
      });
    },
    setSlabThickness: ({ slabThickness }) => {
      get2DViewsAPIs().forEach(api => {
        api.setSlabThickness(slabThickness);
      });
    },
    changeSlabThickness: ({ change }) => {
      get2DViewsAPIs().forEach(api => {
        const slabThickness = Math.max(api.getSlabThickness() + change, 0.1);

        api.setSlabThickness(slabThickness);
      });
    },
    setBlendModeToComposite: () => {
      apis.forEach(api => {
        const renderWindow = api.genericRenderWindow.getRenderWindow();

        const mapper = api.volumes[0].getMapper();
        if (mapper.setBlendModeToComposite) {
          mapper.setBlendModeToComposite();
        }

        if (isA2DAPI(api)) {
          const istyle = renderWindow.getInteractor().getInteractorStyle();

          const slabThickness = api.getSlabThickness();
          if (istyle.setSlabThickness) {
            istyle.setSlabThickness(slabThickness);
          }
        }
        renderWindow.render();
      });
    },
    setBlendModeToMaximumIntensity: () => {
      apis.forEach(api => {
        const renderWindow = api.genericRenderWindow.getRenderWindow();
        const mapper = api.volumes[0].getMapper();
        if (mapper.setBlendModeToMaximumIntensity) {
          mapper.setBlendModeToMaximumIntensity();
        }
        renderWindow.render();
      });
    },
    setBlendMode: ({ blendMode }) => {
      apis.forEach(api => {
        const renderWindow = api.genericRenderWindow.getRenderWindow();

        api.volumes[0].getMapper().setBlendMode(blendMode);

        renderWindow.render();
      });
    },
    mpr2d: async ({ viewports }) => {
      // TODO push a lot of this backdoor logic lower down to the library level.
      const displaySet =
        viewports.viewportSpecificData[viewports.activeViewportIndex];

        // Get current VOI if cornerstone viewport.
      const cornerstoneVOI = getVOIFromCornerstoneViewport();
      defaultVOI = cornerstoneVOI;

      const viewportProps = [
        {
          //Axial
          orientation: {
            sliceNormal: [0, 0, 1],
            viewUp: [0, -1, 0],
          },
        },
        {
          // Sagittal
          orientation: {
            sliceNormal: [1, 0, 0],
            viewUp: [0, 0, 1],
          },
        },
        {
          // Coronal
          orientation: {
            sliceNormal: [0, 1, 0],
            viewUp: [0, 0, 1],
          },
        },
      ];

      try {
        apis = await setMPRLayout(displaySet, viewportProps, 1, 3);
      } catch (error) {
        throw new Error(error);
      }

      const apis2D = get2DViewsAPIs();

      if (cornerstoneVOI) {
        setVOI(cornerstoneVOI);
      }

      // Add widgets and set default interactorStyle of each viewport.
      apis2D.forEach((api, apiIndex) => {
        api.addSVGWidget(
          vtkSVGRotatableCrosshairsWidget.newInstance(),
          'rotatableCrosshairsWidget'
        );

        const uid = api.uid;
        const istyle = isLevelToolEnabled 
          ? vtkInteractorStyleMPRWindowLevel.newInstance() 
          : vtkInteractorStyleRotatableMPRCrosshairs.newInstance();

        api.setInteractorStyle({
          istyle,
          callbacks: isLevelToolEnabled ? callbacks : {},
          configuration: {  apis: apis2D, apiIndex, uid },
        });

        api.svgWidgets.rotatableCrosshairsWidget.setApiIndex(apiIndex);
        api.svgWidgets.rotatableCrosshairsWidget.setApis(apis2D);
      });

      const firstApi = apis2D[0];

      // Initialise crosshairs
      firstApi.svgWidgets.rotatableCrosshairsWidget.resetCrosshairs(apis2D, 0);

      // Check if we have full WebGL 2 support
      const openGLRenderWindow = firstApi.genericRenderWindow.getOpenGLRenderWindow();

      if (!openGLRenderWindow.getWebgl2()) {
        // Throw a warning if we don't have WebGL 2 support,
        // And the volume is too big to fit in a 2D texture

        const openGLContext = openGLRenderWindow.getContext();
        const maxTextureSizeInBytes = openGLContext.getParameter(
          openGLContext.MAX_TEXTURE_SIZE
        );

        const maxBufferLengthFloat32 =
          (maxTextureSizeInBytes * maxTextureSizeInBytes) / 4;

        const dimensions = firstApi.volumes[0]
          .getMapper()
          .getInputData()
          .getDimensions();

        const volumeLength = dimensions[0] * dimensions[1] * dimensions[2];

        if (volumeLength > maxBufferLengthFloat32) {
          const message =
            'This volume is too large to fit in WebGL 1 textures and will display incorrectly. Please use a different browser to view this data';
          LoggerService.error({ message });
          UINotificationService.show({
            title: 'Browser does not support WebGL 2',
            message,
            type: 'error',
            autoClose: false,
          });
        }
      }
    },
    enable3DView: async ({ viewports }) => {
      const currentLayout = viewports.layout.viewports;
      const add3DView = currentLayout.findIndex((layout) => layout.vtk.mode === "3d") === -1;
      const MPRViewports = currentLayout.filter((layout) => layout.vtk.mode === "mpr");
      const viewportSpecificData = viewports.viewportSpecificData;
      const displaySet =
        viewports.viewportSpecificData[viewports.activeViewportIndex];

      // Get current VOI in2D views.
      const apis2D = get2DViewsAPIs();
      const cornerstoneVOI = apis2D[0].getCurrentVOI();

      try {
        apis = await setMPRAnd3DLayout(displaySet, MPRViewports, get2DViewsAPIs(), viewportSpecificData, add3DView);
      } catch (error) {
        throw new Error(error);
      }

      if (add3DView && cornerstoneVOI) {
        const api3D = get3DViewsAPIs();
        api3D.forEach((api3D) => {
          api3D.setInitialVOI(cornerstoneVOI.windowWidth, cornerstoneVOI.windowCenter);
          api3D.updateVOI(cornerstoneVOI.windowWidth, cornerstoneVOI.windowCenter);
          if (isLevelToolEnabled) {
            api3D.enableWindowLevel({enableWindowLevel: true, onLevelsChangedCallback: callbacks.setOnLevelsChanged});
          }
        }) 
      }

      // Render
      apis.forEach((api) => {
        const genericRenderWindow = api.genericRenderWindow;
        genericRenderWindow.resize();
        genericRenderWindow.getRenderWindow().render();
      })
    }
  };

  window.vtkActions = actions;

  const definitions = {
    requestNewSegmentation: {
      commandFn: actions.requestNewSegmentation,
      storeContexts: ['viewports'],
      options: {},
    },
    jumpToSlice: {
      commandFn: actions.jumpToSlice,
      storeContexts: ['viewports'],
      options: {},
    },
    setSegmentationConfiguration: {
      commandFn: actions.setSegmentationConfiguration,
      storeContexts: ['viewports'],
      options: {},
    },
    setSegmentConfiguration: {
      commandFn: actions.setSegmentConfiguration,
      storeContexts: ['viewports'],
      options: {},
    },
    axial: {
      commandFn: actions.axial,
      storeContexts: ['viewports'],
      options: {},
    },
    coronal: {
      commandFn: actions.coronal,
      storeContexts: ['viewports'],
      options: {},
    },
    sagittal: {
      commandFn: actions.sagittal,
      storeContexts: ['viewports'],
      options: {},
    },
    enableRotateTool: {
      commandFn: actions.enableRotateTool,
      options: {},
    },
    enableCrosshairsTool: {
      commandFn: actions.enableCrosshairsTool,
      options: {},
    },
    enableLevelTool: {
      commandFn: actions.enableLevelTool,
      options: {},
    },
    resetMPRView: {
      commandFn: actions.resetMPRView,
      options: {},
    },
    setBlendModeToComposite: {
      commandFn: actions.setBlendModeToComposite,
      options: { blendMode: BlendMode.COMPOSITE_BLEND },
    },
    setBlendModeToMaximumIntensity: {
      commandFn: actions.setBlendModeToMaximumIntensity,
      options: { blendMode: BlendMode.MAXIMUM_INTENSITY_BLEND },
    },
    setBlendModeToMinimumIntensity: {
      commandFn: actions.setBlendMode,
      options: { blendMode: BlendMode.MINIMUM_INTENSITY_BLEND },
    },
    setBlendModeToAverageIntensity: {
      commandFn: actions.setBlendMode,
      options: { blendMode: BlendMode.AVERAGE_INTENSITY_BLEND },
    },
    setSlabThickness: {
      // TODO: How do we pass in a function argument?
      commandFn: actions.setSlabThickness,
      options: {},
    },
    increaseSlabThickness: {
      commandFn: actions.changeSlabThickness,
      options: {
        change: 3,
      },
    },
    decreaseSlabThickness: {
      commandFn: actions.changeSlabThickness,
      options: {
        change: -3,
      },
    },
    mpr2d: {
      commandFn: actions.mpr2d,
      storeContexts: ['viewports'],
      options: {},
      context: 'VIEWER',
    },
    enable3DView: {
      commandFn: actions.enable3DView,
      storeContexts: ['viewports'],
      options: {},
      context: 'VIEWER',
    },
    getVtkApiForViewportIndex: {
      commandFn: actions.getVtkApis,
      context: 'VIEWER',
    },
  };

  return {
    definitions,
    defaultContext: 'ACTIVE_VIEWPORT::VTK',
  };
};

export default commandsModule;

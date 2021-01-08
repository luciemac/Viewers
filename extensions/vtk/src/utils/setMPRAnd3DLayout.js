import setLayoutAndViewportData from './setLayoutAndViewportData.js';

export default function setMPRAnd3DLayout(
  displaySet,
  MPRViewports,
  MPRAPIs,
  currentViewportSpecificData,
  add3DView
) {
  return new Promise((resolve, reject) => {
    const viewports = [...MPRViewports];
    const nbMPRViewports = viewports.length;

    const apis = [...MPRAPIs];
    const viewportSpecificData = Object.assign({}, currentViewportSpecificData);

    if (add3DView) {
      apis[nbMPRViewports] = null;

      viewportSpecificData[nbMPRViewports] = displaySet;
      viewportSpecificData[nbMPRViewports].plugin = 'vtk';
      viewportSpecificData[nbMPRViewports].viewMode = '3d';

      viewports.push({});
      viewports[nbMPRViewports] = {
        vtk: {
          mode: '3d',
          afterCreation: api => {
            apis[nbMPRViewports] = api;
            resolve(apis);
          }
        }
      }
    } else {
      delete viewportSpecificData[nbMPRViewports];
    }

    const numRows = 1;
    const numColumns = add3DView ? nbMPRViewports + 1 : nbMPRViewports;

    setLayoutAndViewportData(
      {
        numRows,
        numColumns,
        viewports,
      },
      viewportSpecificData
    );

    if (!add3DView) {
      resolve(apis);
    }
  });
}

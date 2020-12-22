import { redux } from '@ohif/core';

const { setLayout } = redux.actions;

const setVTK3DLayout = () => {
  return new Promise((resolve, reject) => {
    const layout = {
      numRows: 1,
      numColumns: 1,
      viewports: [{
        plugin: 'vtk-3d',
        afterCreation: api => {
          resolve(api);
        },
      }],
    };

    const action = setLayout(layout);
    window.store.dispatch(action);
  });
}

export default setVTK3DLayout;

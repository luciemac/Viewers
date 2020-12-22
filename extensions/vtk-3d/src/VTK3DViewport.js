import React, { useCallback } from 'react';
import { View3D } from 'react-vtkjs-viewport';
import PropTypes from 'prop-types';

import '../../vtk/src/VTKViewport.css';

const VTK3DViewport = props => {
  const style = { width: '100%', height: '100%', position: 'relative' };

  const setViewportActiveHandler = useCallback(() => {
    const { setViewportActive, viewportIndex, activeViewportIndex } = props;

    if (viewportIndex !== activeViewportIndex) {
      // set in Connected
      setViewportActive();
    }
  });
  return (
    <div
      className="vtk-viewport-handler"
      style={style}
      onClick={setViewportActiveHandler}
    >
      <View3D {...props} />
    </div>
  );
};

VTK3DViewport.propTypes = {
  setViewportActive: PropTypes.func.isRequired,
  viewportIndex: PropTypes.number.isRequired,
  activeViewportIndex: PropTypes.number.isRequired,
};

VTK3DViewport.defaultProps = {};

export default VTK3DViewport;

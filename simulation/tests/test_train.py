import os
import json
import pytest
from unittest.mock import patch, MagicMock
from simulation.train import train_and_sim, MODELS_DIR, DATA_DIR, CONSUMER_PATH, PRODUCER_PATH, TRACE_PATH

@patch("simulation.train.PPO")
def test_train_and_sim(mock_ppo, tmp_path):
    # Mock PPO methods
    mock_instance = MagicMock()
    mock_instance.predict.return_value = ([0.5, 0.5], None)
    mock_ppo.return_value = mock_instance
    
    # redirect paths to tmp_path to avoid creating files in the real directory
    with patch("simulation.train.MODELS_DIR", str(tmp_path / MODELS_DIR)), \
         patch("simulation.train.DATA_DIR", str(tmp_path / DATA_DIR)), \
         patch("simulation.train.CONSUMER_PATH", str(tmp_path / CONSUMER_PATH)), \
         patch("simulation.train.PRODUCER_PATH", str(tmp_path / PRODUCER_PATH)), \
         patch("simulation.train.TRACE_PATH", str(tmp_path / TRACE_PATH)):
        
        train_and_sim()
        
    # Verify calls
    assert mock_ppo.call_count == 2
    assert mock_instance.learn.call_count == 2
    assert mock_instance.save.call_count == 2
    assert mock_instance.predict.call_count > 0
    
    # Verify file creation
    trace_file = tmp_path / TRACE_PATH
    assert trace_file.exists()
    
    with open(trace_file, "r") as f:
        data = json.load(f)
        assert isinstance(data, list)
        assert len(data) > 0
        assert "avg_wage" in data[0]

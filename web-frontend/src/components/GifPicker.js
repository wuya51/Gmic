import React, { useState, useEffect, useCallback } from 'react';
import './GifPicker.css';

const GIPHY_API_KEY = 'u4nLzr0cJvlaK9d4DTe2xiAo3Nc38mV2';

const GifPicker = ({ onGifSelect, onClose }) => {
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('trending');

  const categories = [
    { id: 'trending', name: 'Trending' },
    { id: 'funny', name: 'Funny' },
    { id: 'reaction', name: 'Reaction' },
    { id: 'crypto', name: 'Crypto' },
    { id: 'meme', name: 'Meme' }
  ];

  const fetchGifs = useCallback(async (category = 'trending', query = '') => {
    setLoading(true);
    setError('');
    
    try {
      let url;
      if (query) {
        url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`;
      } else {
        url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch GIFs');
      }
      
      const data = await response.json();
      setGifs(data.data || []);
    } catch (err) {
      setError('Failed to load GIFs');

    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const timeoutId = setTimeout(() => {
        fetchGifs('search', searchQuery);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      fetchGifs(activeCategory);
    }
  }, [searchQuery, activeCategory, fetchGifs]);

  const handleCategoryClick = (categoryId) => {
    setActiveCategory(categoryId);
    setSearchQuery('');
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleGifClick = (gif) => {
    const gifUrl = gif.images.fixed_height.url;
    onGifSelect(gifUrl);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="gif-picker-overlay" onClick={handleOverlayClick}>
      <div className="gif-picker-container">
        <div className="gif-picker-header">
          <div className="gif-picker-title">Choose a GIF</div>
          <button className="gif-picker-close" onClick={onClose}>×</button>
        </div>
        
        <div className="gif-picker-search">
          <input
            type="text"
            placeholder="Search GIFs..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        
        <div className="gif-picker-categories">
          {categories.map(category => (
            <button
              key={category.id}
              className={`gif-category-button ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
        
        <div className="gif-picker-content">
          {loading ? (
            <div className="gif-picker-loading">Loading GIFs...</div>
          ) : error ? (
            <div className="gif-picker-error">{error}</div>
          ) : (
            <div className="gif-grid">
              {gifs.map(gif => (
                <div
                  key={gif.id}
                  className="gif-item"
                  onClick={() => handleGifClick(gif)}
                >
                  <img src={gif.images.fixed_height_small.url} alt={gif.title} />
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="gif-picker-footer">
          Powered by GIPHY
        </div>
      </div>
    </div>
  );
};

export default GifPicker;
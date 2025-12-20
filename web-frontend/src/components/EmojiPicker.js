import React from 'react';
import './EmojiPicker.css';

const EmojiPicker = ({ onEmojiSelect, onClose }) => {
  const emojiCategories = [
    {
      title: 'Frequently Used',
      emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐']
    },
    {
      title: 'Gestures',
      emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🙏', '👏', '👐', '🤲', '🙌']
    },
    {
      title: 'Crypto & Tech',
      emojis: ['🚀', '💰', '💎', '🔥', '🌙', '⭐', '✨', '💫', '🌟', '💯', '🔮', '💻', '📱', '⚡', '🔧', '⚙️', '🛠️', '🔗', '📊', '📈', '📉', '💹', '🏦', '💳', '💵', '💴', '💶', '💷', '🪙']
    }
  ];

  const handleEmojiClick = (emoji) => {
    onEmojiSelect(emoji);
  };

  return (
    <div className="emoji-picker-overlay" onClick={onClose}>
      <div className="emoji-picker-container" onClick={(e) => e.stopPropagation()}>
        <div className="emoji-picker-header">
          <h3>Select Emoji</h3>
          <button className="emoji-picker-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
        
        <div className="emoji-picker-content">
          {emojiCategories.map((category, index) => (
            <div key={index} className="emoji-category">
              <span className="emoji-category-title">{category.title}</span>
              <div className="emoji-grid">
                {category.emojis.map((emoji, emojiIndex) => (
                  <span 
                    key={emojiIndex} 
                    className="emoji-item"
                    onClick={() => handleEmojiClick(emoji)}
                    title={emoji}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmojiPicker;
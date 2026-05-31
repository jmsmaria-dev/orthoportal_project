import { FaUser } from 'react-icons/fa';

export default function ProviderCard({ provider, selected, onSelect }) {
  return (
    <button className={`provider-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="provider-avatar">
        <FaUser />
      </div>
      <div className="provider-info">
        <h4>{provider.name}</h4>
        <p>{provider.specialty}</p>
        <div className="provider-meta">
          <span>{provider.rating} stars</span>
          <span>{provider.reviews} reviews</span>
        </div>
        <span className="provider-location">{provider.location}</span>
      </div>
    </button>
  );
}
